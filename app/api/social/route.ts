// app/api/social/route.ts - WITH DAILY TOP POSTS
import { NextRequest, NextResponse } from 'next/server';

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '';
const NEYNAR_BASE = 'https://api.neynar.com/v2';

function toString(v: unknown, fallback: string): string {
  if (typeof v === 'string') return v;
  return fallback;
}

function toNumber(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Get YYYY-MM-DD from timestamp
function getDateKey(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toISOString().split('T')[0]; // "2026-01-21"
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const fid = sp.get('fid');
  const startUtc = sp.get('start');
  const endUtc = sp.get('end');

  if (!fid || !startUtc || !endUtc) {
    return NextResponse.json({ error: 'Missing fid, start, or end' }, { status: 400 });
  }

  const fidNum = Number(fid);
  if (!Number.isFinite(fidNum) || fidNum <= 0) {
    return NextResponse.json({ error: 'Invalid fid' }, { status: 400 });
  }

  const startMs = Date.parse(startUtc);
  const endMs = Date.parse(endUtc);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }

  const headers: HeadersInit = { accept: 'application/json', 'x-api-key': NEYNAR_API_KEY };

  try {
    // 1. Fetch user profile
    const userUrl = `${NEYNAR_BASE}/farcaster/user/bulk?fids=${fidNum}`;
    const userRes = await fetch(userUrl, { headers, cache: 'no-store' });
    const userData = (await userRes.json()) as { users?: Array<Record<string, unknown>> };
    const user = userData.users?.[0] || {};

    // 2. Fetch user's casts (paginated)
    let allCasts: Array<Record<string, unknown>> = [];
    let cursor: string | null = null;
    
    for (let page = 0; page < 10; page++) {
      const castsUrl = new URL(`${NEYNAR_BASE}/farcaster/feed/user/casts`);
      castsUrl.searchParams.set('fid', String(fidNum));
      castsUrl.searchParams.set('limit', '150');
      castsUrl.searchParams.set('include_replies', 'true');
      if (cursor) castsUrl.searchParams.set('cursor', cursor);

      const castsRes = await fetch(castsUrl.toString(), { headers, cache: 'no-store' });
      const castsData = (await castsRes.json()) as { casts?: Array<Record<string, unknown>>; next?: { cursor?: string } };
      
      const pageCasts = castsData.casts || [];
      allCasts = allCasts.concat(pageCasts);
      
      cursor = castsData.next?.cursor || null;
      if (!cursor || pageCasts.length === 0) break;
      
      const oldestCast = pageCasts[pageCasts.length - 1];
      const oldestMs = Date.parse(toString(oldestCast?.timestamp, ''));
      if (Number.isFinite(oldestMs) && oldestMs < startMs) break;
    }

    // 3. Filter casts within the time window
    const inWindow = allCasts.filter((c) => {
      const timestamp = toString(c['timestamp'], '');
      const ms = Date.parse(timestamp);
      if (!Number.isFinite(ms)) return false;
      return ms >= startMs && ms < endMs;
    });

    // 4. Count engagement
    let castsCount = 0;
    let likesReceived = 0;
    let recastsReceived = 0;
    let repliesReceived = 0;

    for (const cast of inWindow) {
      castsCount++;
      const reactions = cast.reactions as Record<string, unknown> | undefined;
      const replies = cast.replies as Record<string, unknown> | undefined;
      
      likesReceived += toNumber(reactions?.likes_count, 0);
      recastsReceived += toNumber(reactions?.recasts_count, 0);
      repliesReceived += toNumber(replies?.count, 0);
    }

    // 5. Group casts by day, then pick top post for each day
    const castsByDay: Record<string, Array<Record<string, unknown>>> = {};
    
    for (const cast of inWindow) {
      const timestamp = toString(cast.timestamp, '');
      const dayKey = getDateKey(timestamp);
      
      if (!castsByDay[dayKey]) {
        castsByDay[dayKey] = [];
      }
      castsByDay[dayKey].push(cast);
    }

    // 6. Get top post for each day (sorted by engagement)
    const dailyTopPosts: Array<{
      date: string;
      hash: string;
      text: string;
      created_at: string;
      likes: number;
      recasts: number;
      replies: number;
      total_engagement: number;
    }> = [];

    // Sort days chronologically
    const sortedDays = Object.keys(castsByDay).sort();
    
    for (const day of sortedDays) {
      const dayCasts = castsByDay[day];
      
      // Sort by total engagement (likes + recasts + replies)
      dayCasts.sort((a, b) => {
        const aReactions = a.reactions as Record<string, unknown> | undefined;
        const aReplies = a.replies as Record<string, unknown> | undefined;
        const bReactions = b.reactions as Record<string, unknown> | undefined;
        const bReplies = b.replies as Record<string, unknown> | undefined;
        
        const aScore = toNumber(aReactions?.likes_count, 0) + 
                       toNumber(aReactions?.recasts_count, 0) + 
                       toNumber(aReplies?.count, 0);
        const bScore = toNumber(bReactions?.likes_count, 0) + 
                       toNumber(bReactions?.recasts_count, 0) + 
                       toNumber(bReplies?.count, 0);
        return bScore - aScore;
      });

      // Take the top post for this day
      const topCast = dayCasts[0];
      if (topCast) {
        const reactions = topCast.reactions as Record<string, unknown> | undefined;
        const replies = topCast.replies as Record<string, unknown> | undefined;
        const likes = toNumber(reactions?.likes_count, 0);
        const recasts = toNumber(reactions?.recasts_count, 0);
        const repliesCount = toNumber(replies?.count, 0);
        
        dailyTopPosts.push({
          date: day,
          hash: toString(topCast.hash, ''),
          text: toString(topCast.text, ''),
          created_at: toString(topCast.timestamp, ''),
          likes,
          recasts,
          replies: repliesCount,
          total_engagement: likes + recasts + repliesCount,
        });
      }
    }

    return NextResponse.json({
      fid: fidNum,
      user: {
        username: toString(user.username, null),
        display_name: toString(user.display_name, null),
        pfp_url: toString(user.pfp_url, null),
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
      top_posts: dailyTopPosts, // 7 posts - one per day
      debug: {
        total_fetched: allCasts.length,
        in_window: inWindow.length,
        days_with_posts: sortedDays.length,
      }
    });
  } catch (err) {
    console.error('Social API error:', err);
    return NextResponse.json({ error: 'Failed to fetch social data' }, { status: 500 });
  }
}
