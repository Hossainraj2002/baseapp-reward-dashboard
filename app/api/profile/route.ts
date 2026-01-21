import { NextResponse } from 'next/server';
import { buildProfilePayload } from '@/lib/profilePayload';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = (searchParams.get('address') || '').trim();

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address. Expected 0x...' }, { status: 400 });
  }

  try {
    const payload = buildProfilePayload(address);
    return NextResponse.json(payload, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Failed to build profile payload' }, { status: 500 });
  }
}
