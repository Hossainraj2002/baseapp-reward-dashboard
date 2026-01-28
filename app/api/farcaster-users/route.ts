import { NextResponse } from 'next/server';
import { lookupFarcasterUsersByAddresses, normalizeAddressLower } from '@/lib/farcasterStore';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get('addresses') || '').trim();

  if (!raw) {
    return NextResponse.json({ users: {} }, { status: 200 });
  }

  // Accept comma-separated addresses
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Hard cap to protect server
  const MAX = 200;
  const limited = parts.slice(0, MAX);

  // Normalize + dedupe
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const p of limited) {
    const k = normalizeAddressLower(p);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    normalized.push(k);
  }

  // Return only requested subset from local store
  const users = lookupFarcasterUsersByAddresses(normalized);

  return NextResponse.json({ users }, { status: 200 });
}
