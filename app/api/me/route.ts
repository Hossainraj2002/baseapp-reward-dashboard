// app/api/me/route.ts
import { NextResponse } from "next/server";

const NEYNAR_BASE = "https://api.neynar.com";
const MAX_CASTS_FETCH = 150; // keep small for speed

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env.local`);
  return v;
}

function getWeekWindowISO(now = new Date()) {
  // Your rewards are weekly; using UTC week window aligned to UTC Monday 00:00
  // If you want alignment to your reward "week_start_date", we can pass it from Dune later.
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const diffToMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  d.setUTCHours(0, 0, 0, 0);

  const start = d;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  return { start, end };
}

async function neynarGet(path: string, params: Record<string, string | number | boolean | undefined>) {
  const apiKey = requireEnv("NEYNAR_API_KEY");
  const url = new URL(`${NEYNAR_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { "x-api-key": apiKey },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Neynar error (${res.status}): ${text}`);
  }
  return res.json();
}

type Cast = {
  timestamp?: string; // ISO
  text?: string;
  hash?: string;
  parent_hash?: string | null;
  parentHash?: string | null;
  // Neynar often includes reactions + replies counts in a "reactions" object
  reactions?: {
    likes_count?: number;
    recasts_count?: number;
  };
  replies?: {
    count?: number;
  };
  author?: {
    fid?: number;
    username?: string;
    display_name?: string;
    pfp_url?: string;
  };
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fidStr = searchParams.get("fid");
    if (!fidStr) {
      return NextResponse.json({ error: "Provide ?fid=123" }, { status: 400 });
    }

    const fid = Number(fidStr);
    if (!Number.isFinite(fid) || fid <= 0) {
      return NextResponse.json({ error: "Invalid fid" }, { status: 400 });
    }

    // 1) User profile (followers/following included)
    const userJson = await neynarGet("/v2/farcaster/user/bulk", {
      fids: fid,
    });

    const u = userJson?.users?.[0];
    const user = {
      fid,
      username: u?.username ?? null,
      displayName: u?.display_name ?? null,
      pfpUrl: u?.pfp_url ?? null,
      followerCount: Number(u?.follower_count ?? 0),
      followingCount: Number(u?.following_count ?? 0),
    };

    // 2) Recent casts (then filter to "this week")
    const castsJson = await neynarGet("/v2/farcaster/feed/user/casts", {
      fid,
      limit: MAX_CASTS_FETCH,
    });

    const casts: Cast[] = castsJson?.casts ?? [];
    const { start, end } = getWeekWindowISO();

    const weekCasts = casts.filter((c) => {
      if (!c.timestamp) return false;
      const t = new Date(c.timestamp).getTime();
      return t >= start.getTime() && t < end.getTime();
    });

    const totalCasts = weekCasts.length;

    // Replies authored this week = casts that are replies (have parent hash)
    const repliesAuthored = weekCasts.filter((c) => (c.parent_hash ?? c.parentHash) ? true : false).length;

    // Likes/Recasts received on your casts (approx, based on cast reaction counters)
    const likesReceived = weekCasts.reduce((acc, c) => acc + Number(c?.reactions?.likes_count ?? 0), 0);
    const recastsReceived = weekCasts.reduce((acc, c) => acc + Number(c?.reactions?.recasts_count ?? 0), 0);

    // Top casts (simple: highest likes+recasts)
    const topCasts = [...weekCasts]
      .map((c) => ({
        hash: c.hash ?? null,
        text: c.text ?? "",
        timestamp: c.timestamp ?? null,
        likes: Number(c?.reactions?.likes_count ?? 0),
        recasts: Number(c?.reactions?.recasts_count ?? 0),
        score: Number(c?.reactions?.likes_count ?? 0) + Number(c?.reactions?.recasts_count ?? 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return NextResponse.json({
      user,
      thisWeek: {
        weekStartISO: start.toISOString(),
        weekEndISO: end.toISOString(),
        casts: totalCasts,
        repliesAuthored,
        likesReceived,
        recastsReceived,
      },
      topCasts,
      meta: { updatedAt: new Date().toISOString(), source: "neynar" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
