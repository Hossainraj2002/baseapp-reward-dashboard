import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  // Later you can verify signature and store events.
  // For now, just acknowledge.
  const body = await req.text().catch(() => '');
  return NextResponse.json({ ok: true, received: Boolean(body) });
}
