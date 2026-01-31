import { NextResponse } from 'next/server';

type Json = Record<string, unknown>;

type SocialMetrics = {
  casts: number;
  likes: number;
  recasts: number;
  replies: number;
  top_posts: Array<{ text: string; likes: number; recasts: number; replies: number }>;
};

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null;
}

function get(v: unknown, key: string): unknown {
  return isObj(v) ? v[key] : undefined;
}

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function parseMs(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function castCreatedMs(cast: unknown): number | null {
  // Neynar sometimes nests cast under `cast`
  const createdAt =
    str(get(cast, 'created_at')) ??
    str(get(get(cast, 'cast'), 'created_at')) ??
    str(get(cast, 'timestamp')) ??
    str(get(get(cast, 'cast'), 'timestamp'));

  if (!createdAt) return null;
  return parseMs(createdAt);
}

function extractCounts(cast: unknown): { likes: number; recasts: number; replies: number } {
  const reactions = get(cast, 'reactions');
  const repliesObj = get(cast, 'replies');

  const likes = num(get(reactions, 'likes_count'));
  const recasts =
    num(get(reactions, 'recasts_count')) ||
    num(get(reactions, 'recasts')) ||
    num(get(reactions, 'recastsCount'));
  const replies = num(get(repliesObj, 'count'));

  return { likes, recasts, replies };
}

function normalizeText(cast: unknown): string {
  const text = str(get(cast, 'text')) ?? str(get(get(cast, 'cast'), 'text')) ?? '';
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed.length > 280 ? `${trimmed.slice(0, 277)}...` : trimmed;
}

function buildTopPostItem(cast: unknown): { text: string; likes: number; recasts: number; replies: number } {
  const { likes, recasts, replies } = extractCounts(cast);
  return {
    text: normalizeText(cast),
    likes,
    recasts,
    replies,
  };
}

function rankScore(p: { likes: number; recasts: number; replies: number }): number {
  // simple, stable scoring; tweak later if you want
  return p.likes + p.recasts * 2 + p.replies;
}

async function fetchUserCasts(
  fid: number,
  apiKey: string,
  startMs: number,
  endMs: number
): Promise<unknown[]> {
  const casts: unknown[] = [];
  let cursor: string | null = null;

  // Safety: cap pages so we never infinite loop (also controls Neynar cost)
  for (let page = 0; page < 20; page += 1) {
    const url = new URL('https://api.neynar.com/v2/farcaster/feed/user/casts');
    url.searchParams.set('fid', String(fid));
    url.searchParams.set('limit', '100');
    url.searchParams.set('include_replies', 'false');
    url.searchParams.set('include_recasts', 'false');

    if (cursor) url.searchParams.set('cursor', cursor);

    const res = await fetch(url.toString(), {
      headers: {
        accept: 'application/json',
        api_key: apiKey,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Neynar error: ${res.status}`);
    }

    const json: unknown = await res.json();
    const items = get(json, 'casts');
    if (Array.isArray(items)) {
      // Filter by timeframe here, because the endpoint may not support start/end directly.
      for (const c of items) {
        const ms = castCreatedMs(c);
        if (ms == null) continue;
        if (ms >= startMs && ms < endMs) casts.push(c);
      }

      // If the API returns items older than start, we can stop early.
      // We look at the oldest item on this page.
      const last = items.length > 0 ? items[items.length - 1] : null;
      const lastMs = last ? castCreatedMs(last) : null;
      if (lastMs != null && lastMs < startMs) break;
    }

    const next = str(get(json, 'next'));
    cursor = next;

    if (!cursor) break;
  }

  return casts;
}

export async function GET(req: Request) {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing NEYNAR_API_KEY' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const fidRaw = (searchParams.get('fid') || '').trim();
  const start = (searchParams.get('start') || '').trim();
  const end = (searchParams.get('end') || '').trim();
  const includeTopPosts = searchParams.get('includeTopPosts') === '1';

  const fid = Number(fidRaw);
  if (!Number.isFinite(fid) || fid <= 0) {
    return NextResponse.json({ error: 'Invalid fid' }, { status: 400 });
  }

  const startMs = parseMs(start);
  const endMs = parseMs(end);
  if (startMs == null || endMs == null || endMs <= startMs) {
    return NextResponse.json({ error: 'Invalid start/end' }, { status: 400 });
  }

  try {
    const casts = await fetchUserCasts(fid, apiKey, startMs, endMs);

    let totalLikes = 0;
    let totalRecasts = 0;
    let totalReplies = 0;

    const topCandidates: Array<{ text: string; likes: number; recasts: number; replies: number }> = [];

    for (const c of casts) {
      const counts = extractCounts(c);
      totalLikes += counts.likes;
      totalRecasts += counts.recasts;
      totalReplies += counts.replies;

      if (includeTopPosts) {
        topCandidates.push(buildTopPostItem(c));
      }
    }

    let top_posts: SocialMetrics['top_posts'] = [];
    if (includeTopPosts) {
      top_posts = topCandidates
        .sort((a, b) => rankScore(b) - rankScore(a))
        .slice(0, 7)
        .map((p) => ({
          text: p.text,
          likes: p.likes,
          recasts: p.recasts,
          replies: p.replies,
        }));
    }

    const payload: SocialMetrics = {
      casts: casts.length,
      likes: totalLikes,
      recasts: totalRecasts,
      replies: totalReplies,
      top_posts,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Failed to load social data' }, { status: 500 });
  }
}
