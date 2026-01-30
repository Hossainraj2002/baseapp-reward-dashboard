// app/api/social/route.ts
// Social aggregation for a given fid within a time window.
// Option A semantics (low cost):
// - Casts = number of root casts created within the window (replies excluded)
// - Likes/Recasts/Replies = current totals on those casts

import { NextRequest, NextResponse } from 'next/server';

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '';
const NEYNAR_BASE = 'https://api.neynar.com/v2';

function toString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function toNumber(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isRootCast(cast: Record<string, unknown>): boolean {
  // Replies usually have a parent_hash (or parent_author / parent_url).
  // Recasts often have a recasted_cast or cast_type.
  const parentHash = cast['parent_hash'];
  const parentAuthor = cast['parent_author'];
  const parentUrl = cast['parent_url'];
  const recasted = cast['recasted_cast'];
  const castType = cast['cast_type'];

  const hasParent =
    (typeof parentHash === 'string' && parentHash.length > 0) ||
    parentHash != null ||
    (typeof parentAuthor === 'object' && parentAuthor != null) ||
    (typeof parentUrl === 'string' && parentUrl.length > 0);

  const isRecast = recasted != null || (typeof castType === 'string' && castType.toLowerCase() === 'recast');

  return !hasParent && !isRecast;
}

type NeynarUserBulkResponse = {
  users?: Array<Record<string, unknown>>;
};

type NeynarUserCastsResponse = {
  casts?: Array<Record<string, unknown>>;
  next?: { cursor?: string };
};

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const fidRaw = sp.get('fid');
  const startUtc = sp.get('start');
  const endUtc = sp.get('end');

  if (!fidRaw || !startUtc || !endUtc) {
    return NextResponse.json({ error: 'Missing fid, start, or end' }, { status: 400 });
  }

  const fid = Number(fidRaw);
  if (!Number.isFinite(fid) || fid <= 0) {
    return NextResponse.json({ error: 'Invalid fid' }, { status: 400 });
  }

  const startMs = Date.parse(startUtc);
  const endMs = Date.parse(endUtc);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }

  if (!NEYNAR_API_KEY) {
    return NextResponse.json({ error: 'Neynar API key missing or unavailable' }, { status: 500 });
  }

  const headers: HeadersInit = { accept: 'application/json', 'x-api-key': NEYNAR_API_KEY };

  try {
    // 1) Fetch user profile (kept for compatibility; UI may use it or ignore it)
    const userUrl = `${NEYNAR_BASE}/farcaster/user/bulk?fids=${fid}`;
    const userRes = await fetch(userUrl, { headers, cache: 'no-store' });
    if (!userRes.ok) {
      return NextResponse.json({ error: `Failed to fetch user (${userRes.status})` }, { status: 502 });
    }
    const userData = (await userRes.json()) as NeynarUserBulkResponse;
    const user = userData.users?.[0] || {};

    // 2) Fetch user's casts (paginated)
    // NOTE: include_replies=false to match “main posts” expectation.
    let allCasts: Array<Record<string, unknown>> = [];
    let cursor: string | null = null;

    for (let page = 0; page < 10; page++) {
      const castsUrl = new URL(`${NEYNAR_BASE}/farcaster/feed/user/casts`);
      castsUrl.searchParams.set('fid', String(fid));
      castsUrl.searchParams.set('limit', '150');
      castsUrl.searchParams.set('include_replies', 'false');
      if (cursor) castsUrl.searchParams.set('cursor', cursor);

      const castsRes = await fetch(castsUrl.toString(), { headers, cache: 'no-store' });
      if (!castsRes.ok) {
        return NextResponse.json({ error: `Failed to fetch casts (${castsRes.status})` }, { status: 502 });
      }

      const castsData = (await castsRes.json()) as NeynarUserCastsResponse;
      const pageCasts = castsData.casts || [];

      allCasts = allCasts.concat(pageCasts);
      cursor = castsData.next?.cursor || null;

      if (!cursor || pageCasts.length === 0) break;

      const oldestCast = pageCasts[pageCasts.length - 1];
      const oldestMs = Date.parse(toString(oldestCast?.timestamp, ''));
      if (Number.isFinite(oldestMs) && oldestMs < startMs) break;
    }

    // 3) Filter casts within the time window AND ensure root casts
    const inWindowRoot = allCasts
      .filter((c) => {
        const timestamp = toString(c['timestamp'], '');
        const ms = Date.parse(timestamp);
        if (!Number.isFinite(ms)) return false;
        return ms >= startMs && ms < endMs;
      })
      .filter((c) => isRootCast(c));

    // 4) Count engagement
    let castsCount = 0;
    let likesReceived = 0;
    let recastsReceived = 0;
    let repliesReceived = 0;

    for (const cast of inWindowRoot) {
      castsCount++;
      const reactions = cast.reactions as Record<string, unknown> | undefined;
      const replies = cast.replies as Record<string, unknown> | undefined;

      likesReceived += toNumber(reactions?.likes_count, 0);
      recastsReceived += toNumber(reactions?.recasts_count, 0);
      repliesReceived += toNumber(replies?.count, 0);
    }

    // 5) Top 7 posts in the window (sorted by engagement)
    const scored = inWindowRoot
      .map((c) => {
        const reactions = c.reactions as Record<string, unknown> | undefined;
        const replies = c.replies as Record<string, unknown> | undefined;
        const likes = toNumber(reactions?.likes_count, 0);
        const recasts = toNumber(reactions?.recasts_count, 0);
        const repl = toNumber(replies?.count, 0);
        return {
          cast: c,
          likes,
          recasts,
          replies: repl,
          score: likes + recasts + repl,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 7);

    const topPosts = scored.map((s) => {
      const c = s.cast;
      return {
        hash: toString(c.hash, ''),
        text: toString(c.text, ''),
        created_at: toString(c.timestamp, ''),
        likes: s.likes,
        recasts: s.recasts,
        replies: s.replies,
        url: toString(c.url, ''),
      };
    });

    return NextResponse.json({
      fid,
      user: {
        username: toString(user.username, ''),
        display_name: toString(user.display_name, ''),
        pfp_url: toString(user.pfp_url, ''),
        follower_count: toNumber(user.follower_count, 0),
        following_count: toNumber(user.following_count, 0),
      },
      window: {
        start_utc: startUtc,
        end_utc: endUtc,
      },
      engagement: {
        casts: castsCount,
        likes: likesReceived,
        recasts: recastsReceived,
        replies: repliesReceived,
      },
      top_posts: topPosts,
    });
  } catch (err) {
    console.error('Social API error:', err);
    return NextResponse.json({ error: 'Failed to fetch social data' }, { status: 500 });
  }
}
