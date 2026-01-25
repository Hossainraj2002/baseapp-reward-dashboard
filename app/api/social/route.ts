import { NextResponse } from 'next/server';

const NEYNAR_BASE = 'https://api.neynar.com/v2';

function requireApiKey(): string {
  const k = process.env.NEYNAR_API_KEY;
  if (!k) throw new Error('Missing NEYNAR_API_KEY');
  return k;
}

function toNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function toString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function toIsoMs(dateOrMs: string | number): number {
  if (typeof dateOrMs === 'number') return dateOrMs;
  const ms = Date.parse(dateOrMs);
  return Number.isFinite(ms) ? ms : 0;
}

type SocialResponse = {
  fid: number;
  user: {
    username: string | null;
    display_name: string | null;
    pfp_url: string | null;
    follower_count: number;
    following_count: number;
  };
  window: { start_utc: string; end_utc: string };
  engagement: {
    casts: number;
    likes: number;
    recasts: number;
    replies: number;
  };
  top_posts: Array<{
    hash: string;
    text: string;
    created_at: string;
    likes: number;
    recasts: number;
    replies: number;
    url: string;
  }>;
};

async function neynarFetch<T>(url: string): Promise<T> {
  const apiKey = requireApiKey();
  const res = await fetch(url, {
    headers: {
      api_key: apiKey,
      accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Neynar request failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return (await res.json()) as T;
}

type NeynarBulkUser = {
  username?: string;
  display_name?: string;
  pfp_url?: string;
  follower_count?: number;
  following_count?: number;
};

type NeynarBulkResponse = {
  users?: NeynarBulkUser[];
};

function pickUserFromBulkResponse(json: NeynarBulkResponse | unknown) {
  const obj = json as NeynarBulkResponse;
  const u = Array.isArray(obj?.users) ? obj.users[0] : undefined;
  if (!u) return null;

  return {
    username: u.username ?? null,
    display_name: u.display_name ?? null,
    pfp_url: u.pfp_url ?? null,
    follower_count: toNumber(u.follower_count, 0),
    following_count: toNumber(u.following_count, 0),
  };
}

type NeynarNext = { cursor?: string };
type NeynarUserCast = {
  hash?: string;
  text?: string;
  created_at?: string;
  reactions?: {
    likes_count?: number;
    recasts_count?: number;
  };
  replies?: {
    count?: number;
  };
  replies_count?: number;
};

type NeynarUserCastsResponse = {
  casts?: NeynarUserCast[];
  next?: NeynarNext;
};

function extractCastFields(c: NeynarUserCast) {
  const hash = toString(c.hash, '');
  const text = toString(c.text, '');
  const createdAt = toString(c.created_at, '');

  const likes = toNumber(c.reactions?.likes_count, 0);
  const recasts = toNumber(c.reactions?.recasts_count, 0);
  const replies = toNumber(c.replies?.count, toNumber(c.replies_count, 0));

  const url = hash ? `https://warpcast.com/~/cast/${encodeURIComponent(hash)}` : '';

  return { hash, text, created_at: createdAt, likes, recasts, replies, url };
}

async function fetchUserCasts(fid: number, maxPages = 6) {
  const casts: NeynarUserCast[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const u = new URL(`${NEYNAR_BASE}/farcaster/feed/user/casts`);
    u.searchParams.set('fid', String(fid));
    u.searchParams.set('limit', '100');
    if (cursor) u.searchParams.set('cursor', cursor);

    const json = await neynarFetch<NeynarUserCastsResponse>(u.toString());

    const items = Array.isArray(json.casts) ? json.casts : [];
    casts.push(...items);

    const nextCursor = typeof json.next?.cursor === 'string' ? json.next.cursor : null;
    cursor = nextCursor;

    if (!cursor) break;
  }

  return casts;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fidRaw = searchParams.get('fid');
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    const fid = fidRaw ? Number(fidRaw) : NaN;
    if (!Number.isFinite(fid) || fid <= 0) {
      return NextResponse.json({ error: 'Missing or invalid fid' }, { status: 400 });
    }

    if (!start || !end) {
      return NextResponse.json({ error: 'Missing start/end window' }, { status: 400 });
    }

    const startMs = toIsoMs(start);
    const endMs = toIsoMs(end);
    if (!startMs || !endMs || endMs <= startMs) {
      return NextResponse.json({ error: 'Invalid start/end window' }, { status: 400 });
    }

    // 1) User
    const bulkUrl = new URL(`${NEYNAR_BASE}/farcaster/user/bulk`);
    bulkUrl.searchParams.set('fids', String(fid));
    const bulk = await neynarFetch<NeynarBulkResponse>(bulkUrl.toString());

    const user =
      pickUserFromBulkResponse(bulk) ??
      ({ username: null, display_name: null, pfp_url: null, follower_count: 0, following_count: 0 } as const);

    // 2) Casts in window
    const allCasts = await fetchUserCasts(fid);
    const inWindow = allCasts.filter((c) => {
      const createdAt = toString(c.created_at, '');
      const ms = Date.parse(createdAt);
      if (!Number.isFinite(ms)) return false;
      return ms >= startMs && ms < endMs;
    });

    const extracted = inWindow.map(extractCastFields);

    const engagement = extracted.reduce(
      (acc, c) => {
        acc.casts += 1;
        acc.likes += c.likes;
        acc.recasts += c.recasts;
        acc.replies += c.replies;
        return acc;
      },
      { casts: 0, likes: 0, recasts: 0, replies: 0 }
    );

    const top_posts = extracted
      .slice()
      .sort((a, b) => b.likes + b.recasts + b.replies - (a.likes + a.recasts + a.replies))
      .slice(0, 7);

    const out: SocialResponse = {
      fid,
      user,
      window: { start_utc: start, end_utc: end },
      engagement,
      top_posts,
    };

    return NextResponse.json(out, {
      headers: { 'cache-control': 'no-store, max-age=0' },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || 'Failed to fetch social data' }, { status: 500 });
  }
}
