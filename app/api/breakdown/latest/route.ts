export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { readJson } from "@/lib/data";

export async function GET() {
  const data = readJson<any>("breakdown_latest.json");
  return NextResponse.json(data);
}
