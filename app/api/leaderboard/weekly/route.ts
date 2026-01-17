export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { readJson } from "@/lib/data";

type Row = {
  rank: number;
  user_address: string;
  this_week_reward: number;
  previous_week_reward: number;
  all_time_reward: number;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const limit = Math.min(Number(searchParams.get("limit") || 10), 50);
  const offset = Math.max(Number(searchParams.get("offset") || 0), 0);
  const search = (searchParams.get("search") || "").trim().toLowerCase();

  const snap = readJson<{ rows: Row[]; meta: any }>("leaderboard_weekly_latest.json");
  let rows = snap.rows || [];

  if (search) {
    rows = rows.filter((r) => r.user_address.toLowerCase().includes(search));
  }

  const total = rows.length;
  const pageRows = rows.slice(offset, offset + limit);

  return NextResponse.json({
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
