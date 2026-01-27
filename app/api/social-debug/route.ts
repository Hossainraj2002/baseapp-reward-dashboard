import { NextResponse } from 'next/server';

const NEYNAR_BASE = 'https://api.neynar.com/v2';

function requireApiKey(): string {
  const k = process.env.NEYNAR_API_KEY;
  if (!k) throw new Error('Missing NEYNAR_API_KEY');
  return k;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fid = searchParams.get('fid') || '264344';
    
    const apiKey = requireApiKey();
    
    // Fetch raw casts
    const castsUrl = new URL(`${NEYNAR_BASE}/farcaster/feed/user/casts`);
    castsUrl.searchParams.set('fid', fid);
    castsUrl.searchParams.set('limit', '10');
    
    const castsRes = await fetch(castsUrl.toString(), {
      headers: {
        api_key: apiKey,
        accept: 'application/json',
      },
      cache: 'no-store',
    });
    
    const castsJson = await castsRes.json();
    
    // Fetch raw replies and recasts
    const repliesUrl = new URL(`${NEYNAR_BASE}/farcaster/feed/user/replies_and_recasts`);
    repliesUrl.searchParams.set('fid', fid);
    repliesUrl.searchParams.set('limit', '10');
    
    const repliesRes = await fetch(repliesUrl.toString(), {
      headers: {
        api_key: apiKey,
        accept: 'application/json',
      },
      cache: 'no-store',
    });
    
    const repliesJson = await repliesRes.json();
    
    // Return raw data for debugging
    return NextResponse.json({
      debug: true,
      fid,
      endpoints: {
        casts: {
          url: castsUrl.toString().replace(apiKey, '***'),
          status: castsRes.status,
          count: castsJson?.casts?.length || 0,
          firstCast: castsJson?.casts?.[0] || null,
          raw: castsJson,
        },
        replies_and_recasts: {
          url: repliesUrl.toString().replace(apiKey, '***'),
          status: repliesRes.status,
          count: repliesJson?.casts?.length || 0,
          firstItem: repliesJson?.casts?.[0] || null,
          raw: repliesJson,
        },
      },
    });
  } catch (e) {
    return NextResponse.json({ 
      error: e instanceof Error ? e.message : 'Unknown error' 
    }, { status: 500 });
  }
}
