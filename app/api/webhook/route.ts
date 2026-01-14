import { NextResponse } from "next/server";

export async function POST(req: Request) {
  // For now we just acknowledge. Later we can handle events/notifications.
  const body = await req.json().catch(() => ({}));
  return NextResponse.json({ ok: true, received: body });
}
