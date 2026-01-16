import { NextResponse } from "next/server";
import { readJson } from "@/lib/data";

export async function GET() {
  const data = readJson<any>("weekly.json");
  return NextResponse.json(data);
}
