export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { readJson } from "@/lib/data";

type Snap = {
  columns: string[];
  rows: Record<string, any>[];
  meta: any;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const limit = Math.min(Number(searchParams.get("limit") || 10), 50);
  const offset = Math.max(Number(searchParams.get("offset") || 0), 0);
  const search = (searchParams.get("search") || "").trim().toLowerCase();

  const snap = readJson<Snap>("leaderboard_all_time.json");
  let rows = snap.rows || [];

  if (search) {
    rows = rows.filter((r) =>
      String(r.user_address || "").toLowerCase().includes(search)
    );
  }

  const total = rows.length;
  const pageRows = rows.slice(offset, offset + limit);

  return NextResponse.json({
    columns: snap.columns || [],
    rows: pageRows,
    meta: {
      ...snap.meta,
      limit,
      offset,
      total,
      hasMore: offset + limit < total,
    },
  });
}
