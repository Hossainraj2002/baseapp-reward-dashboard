import { NextResponse } from 'next/server';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { buildProfilePayload, type ProfilePayload } from '@/lib/profilePayload';

type NeynarUser = {
  fid?: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
  profile?: { bio?: { text?: string } };
  follower_count?: number;
  following_count?: number;
  score?: number;
  experimental?: { neynar_user_score?: number };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

async function fetchFarcasterFromNeynar(address: string): Promise<ProfilePayload['farcaster']> {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new NeynarAPIClient({ apiKey });

    // SDK method per Neynar docs
    const respUnknown: unknown = await client.fetchBulkUsersByEthOrSolAddress({
      addresses: [address],
    });

    if (!isRecord(respUnknown)) return null;

    const lower = address.toLowerCase();
    const listUnknown = respUnknown[lower] ?? respUnknown[address];

    if (!Array.isArray(listUnknown) || listUnknown.length === 0) return null;

    const u = listUnknown[0] as NeynarUser;
    if (!u || typeof u.fid !== 'number') return null;

    const score = toNumberOrNull(u.score);
    const neynarUserScore = toNumberOrNull(u.experimental?.neynar_user_score);

    return {
      fid: u.fid,
      username: typeof u.username === 'string' ? u.username : '',
      display_name: typeof u.display_name === 'string' ? u.display_name : null,
      pfp_url: typeof u.pfp_url === 'string' ? u.pfp_url : null,
      bio_text: typeof u.profile?.bio?.text === 'string' ? u.profile.bio.text : null,
      follower_count: toNumberOrNull(u.follower_count),
      following_count: toNumberOrNull(u.following_count),
      score,
      neynar_user_score: neynarUserScore,
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = (searchParams.get('address') || '').trim();
  const resolve = searchParams.get('resolve') === '1';

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address. Expected 0x...' }, { status: 400 });
  }

  try {
    const payload = buildProfilePayload(address);

    // If not in local store (~15k), optionally resolve via Neynar
    if (resolve && !payload.farcaster) {
      const fc = await fetchFarcasterFromNeynar(address);
      if (fc) payload.farcaster = fc;
    }

    return NextResponse.json(payload, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Failed to build profile payload' }, { status: 500 });
  }
}
