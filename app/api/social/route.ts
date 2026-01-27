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

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
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

function pickUserFromBulkResponse(json: unknown) {
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
  reactions?: { likes_count?: number; recasts_count?: number };
  replies?: { count?: number };
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

async function fetchAllUserCasts(fid: number, maxPages = 6) {
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

/**
 * This endpoint returns BOTH replies and recasts by the user.
 * We keep this generic because Neynar sometimes changes response shapes.
 */
async function fetchRepliesAndRecasts(fid: number, maxPages = 6): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const u = new URL(`${NEYNAR_BASE}/farcaster/feed/user/replies_and_recasts`);
    u.searchParams.set('fid', String(fid));
    u.searchParams.set('limit', '100');
    if (cursor) u.searchParams.set('cursor', cursor);

    const json = await neynarFetch<unknown>(u.toString());

    let items: unknown[] = [];
    if (isRecord(json)) {
      const maybe = json['casts'];
      if (Array.isArray(maybe)) items = maybe;
      const maybe2 = json['items'];
      if (!items.length && Array.isArray(maybe2)) items = maybe2;
      const maybe3 = json['result'];
      if (!items.length && Array.isArray(maybe3)) items = maybe3;
    }

    for (const it of items) {
      if (isRecord(it)) out.push(it);
    }

    let nextCursor: string | null = null;
    if (isRecord(json) && isRecord(json['next']) && typeof json['next']['cursor'] === 'string') {
      nextCursor = json['next']['cursor'];
    }
    cursor = nextCursor;
    if (!cursor) break;
  }

  return out;
}

/**
 * Fetch likes made by the user (outgoing).
 * Uses generic parsing to avoid breaking on minor shape changes.
 */
async function fetchUserLikes(fid: number, maxPages = 6): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const u = new URL(`${NEYNAR_BASE}/farcaster/reactions/user`);
    u.searchParams.set('fid', String(fid));
    u.searchParams.set('limit', '100');
    // Many deployments support reaction_type=like. If unsupported, Neynar will ignore or error.
    u.searchParams.set('reaction_type', 'like');
    if (cursor) u.searchParams.set('cursor', cursor);

    const json = await neynarFetch<unknown>(u.toString());

    let items: unknown[] = [];
    if (isRecord(json)) {
      const maybe = json['reactions'];
      if (Array.isArray(maybe)) items = maybe;
      const maybe2 = json['items'];
      if (!items.length && Array.isArray(maybe2)) items = maybe2;
    }

    for (const it of items) {
      if (isRecord(it)) out.push(it);
    }

    let nextCursor: string | null = null;
    if (isRecord(json) && isRecord(json['next']) && typeof json['next']['cursor'] === 'string') {
      nextCursor = json['next']['cursor'];
    }
    cursor = nextCursor;
    if (!cursor) break;
  }

  return out;
}

function extractCreatedAtMs(obj: Record<string, unknown>): number {
  // Try common paths where Neynar stores timestamps
  const direct = obj['created_at'];
  if (typeof direct === 'string') return toIsoMs(direct);

  const ts = obj['timestamp'];
  if (typeof ts === 'string' || typeof ts === 'number') return toIsoMs(ts);

  if (isRecord(obj['reaction'])) {
    const r = obj['reaction'];
    const rca = r['created_at'];
    if (typeof rca === 'string') return toIsoMs(rca);
  }

  if (isRecord(obj['cast'])) {
    const c = obj['cast'];
    const ca = c['created_at'];
    if (typeof ca === 'string') return toIsoMs(ca);
  }

  return 0;
}

function classifyReplyOrRecast(obj: Record<string, unknown>): 'reply' | 'recast' | 'unknown' {
  const t = obj['type'];
  if (typeof t === 'string') {
    const s = t.toLowerCase();
    if (s.includes('reply')) return 'reply';
    if (s.includes('recast')) return 'recast';
  }

  // Sometimes Neynar uses "reaction_type" for recasts
  const rt = obj['reaction_type'];
  if (typeof rt === 'string' && rt.toLowerCase().includes('recast')) return 'recast';

  // Sometimes recasts are a "recasted_cast" object, and replies have "parent_hash"
  if (isRecord(obj['recasted_cast'])) return 'recast';
  if (typeof obj['parent_hash'] === 'string') return 'reply';

  return 'unknown';
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

    // 1) User profile
    const bulkUrl = new URL(`${NEYNAR_BASE}/farcaster/user/bulk`);
    bulkUrl.searchParams.set('fids', String(fid));
    const bulk = await neynarFetch<unknown>(bulkUrl.toString());

    const user =
      pickUserFromBulkResponse(bulk) ??
      ({ username: null, display_name: null, pfp_url: null, follower_count: 0, following_count: 0 } as const);

    // 2) Casts (for “casts count” + top posts ranking)
    const allCasts = await fetchAllUserCasts(fid);
    const castsInWindow = allCasts.filter((c) => {
      const ms = Date.parse(toString(c.created_at, ''));
      return Number.isFinite(ms) && ms >= startMs && ms < endMs;
    });

    // Top posts = top casts by received engagement
    const extractedCasts = castsInWindow.map(extractCastFields);
    const top_posts = extractedCasts
      .slice()
      .sort((a, b) => b.likes + b.recasts + b.replies - (a.likes + a.recasts + a.replies))
      .slice(0, 7);

    // 3) Replies + Recasts (OUTGOING)
    const rr = await fetchRepliesAndRecasts(fid);
    let replies = 0;
    let recasts = 0;

    for (const item of rr) {
      const ms = extractCreatedAtMs(item);
      if (!ms || ms < startMs || ms >= endMs) continue;

      const kind = classifyReplyOrRecast(item);
      if (kind === 'reply') replies += 1;
      else if (kind === 'recast') recasts += 1;
    }

    // 4) Likes (OUTGOING)
    const likesItems = await fetchUserLikes(fid);
    let likes = 0;
    for (const item of likesItems) {
      const ms = extractCreatedAtMs(item);
      if (!ms || ms < startMs || ms >= endMs) continue;
      likes += 1;
    }

    const out: SocialResponse = {
      fid,
      user,
      window: { start_utc: start, end_utc: end },
      engagement: {
        casts: castsInWindow.length,
        likes,
        recasts,
        replies,
      },
      top_posts,
    };

    return NextResponse.json(out, { headers: { 'cache-control': 'no-store, max-age=0' } });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message || 'Failed to fetch social data' },
      { status: 500 }
    );
  }
}
