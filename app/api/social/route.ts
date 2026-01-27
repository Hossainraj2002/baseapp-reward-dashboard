import { NextResponse } from 'next/server';

const NEYNAR_BASE = 'https://api.neynar.com/v2';

// Neynar requires limit between 1 and 50
const NEYNAR_LIMIT = 50;

function requireApiKey(): string {
  const k = process.env.NEYNAR_API_KEY;
  if (!k) throw new Error('Missing NEYNAR_API_KEY');
  return k;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function toNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function toString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function toIsoMs(dateOrIso: string): number {
  const ms = Date.parse(dateOrIso);
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
  engagement: { casts: number; likes: number; recasts: number; replies: number };
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

async function neynarFetch(url: string): Promise<unknown> {
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
    throw new Error(`Neynar request failed (${res.status}): ${text.slice(0, 250)}`);
  }

  return res.json() as Promise<unknown>;
}

/**
 * Bulk user response (we parse safely)
 */
function pickUserFromBulkResponse(json: unknown): SocialResponse['user'] {
  if (!isRecord(json)) {
    return { username: null, display_name: null, pfp_url: null, follower_count: 0, following_count: 0 };
  }
  const users = json['users'];
  const u0 = Array.isArray(users) && users.length > 0 && isRecord(users[0]) ? users[0] : null;

  if (!u0) {
    return { username: null, display_name: null, pfp_url: null, follower_count: 0, following_count: 0 };
  }

  return {
    username: typeof u0['username'] === 'string' ? (u0['username'] as string) : null,
    display_name: typeof u0['display_name'] === 'string' ? (u0['display_name'] as string) : null,
    pfp_url: typeof u0['pfp_url'] === 'string' ? (u0['pfp_url'] as string) : null,
    follower_count: toNumber(u0['follower_count'], 0),
    following_count: toNumber(u0['following_count'], 0),
  };
}

type ExtractedCast = {
  hash: string;
  text: string;
  created_at: string;
  likes: number;
  recasts: number;
  replies: number;
  url: string;
};

function extractCastFields(c: Record<string, unknown>): ExtractedCast {
  const hash = toString(c['hash'], '');
  const text = toString(c['text'], '');
  const created_at = toString(c['created_at'], '');

  // Most common Neynar shape:
  // reactions.likes_count, reactions.recasts_count
  let likes = 0;
  let recasts = 0;
  let replies = 0;

  const reactions = c['reactions'];
  if (isRecord(reactions)) {
    likes = toNumber(reactions['likes_count'], 0);
    recasts = toNumber(reactions['recasts_count'], 0);
  }

  const repliesObj = c['replies'];
  if (isRecord(repliesObj)) {
    replies = toNumber(repliesObj['count'], 0);
  } else {
    // fallback sometimes exists as replies_count
    replies = toNumber(c['replies_count'], 0);
  }

  const url = hash ? `https://warpcast.com/~/cast/${encodeURIComponent(hash)}` : '';

  return { hash, text, created_at, likes, recasts, replies, url };
}

async function fetchUserCasts(fid: number, maxPages = 10): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const u = new URL(`${NEYNAR_BASE}/farcaster/feed/user/casts`);
    u.searchParams.set('fid', String(fid));
    u.searchParams.set('limit', String(NEYNAR_LIMIT)); // ✅ must be 1..50
    if (cursor) u.searchParams.set('cursor', cursor);

    const json = await neynarFetch(u.toString());

    // casts array
    let casts: unknown[] = [];
    if (isRecord(json) && Array.isArray(json['casts'])) {
      casts = json['casts'] as unknown[];
    }

    for (const item of casts) {
      if (isRecord(item)) out.push(item);
    }

    // next cursor
    let nextCursor: string | null = null;
    if (isRecord(json) && isRecord(json['next']) && typeof json['next']['cursor'] === 'string') {
      nextCursor = json['next']['cursor'] as string;
    }
    cursor = nextCursor;
    if (!cursor) break;
  }

  return out;
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

    // 1) user info
    const bulkUrl = new URL(`${NEYNAR_BASE}/farcaster/user/bulk`);
    bulkUrl.searchParams.set('fids', String(fid));
    const bulkJson = await neynarFetch(bulkUrl.toString());
    const user = pickUserFromBulkResponse(bulkJson);

    // 2) casts -> filter in window
    const allCasts = await fetchUserCasts(fid);

    const inWindow = allCasts.filter((c) => {
      const created_at = toString(c['created_at'], '');
      const ms = Date.parse(created_at);
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
    const msg = e instanceof Error ? e.message : 'Failed to fetch social data';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
