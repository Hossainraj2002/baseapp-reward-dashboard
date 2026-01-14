import { NextResponse } from "next/server";

const DUNE_API_BASE = "https://api.dune.com/api/v1/query";

async function fetchDuneResults(queryId: number, limit = 1000, offset = 0) {
  const apiKey = process.env.DUNE_API_KEY;
  if (!apiKey) throw new Error("Missing DUNE_API_KEY in .env.local");

  const url = `${DUNE_API_BASE}/${queryId}/results?limit=${limit}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { "x-dune-api-key": apiKey },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dune API error (${res.status}): ${text}`);
  }
  return res.json();
}

export async function GET() {
  try {
    const BREAKDOWN_QUERY_ID = 6493342;

    const json = await fetchDuneResults(BREAKDOWN_QUERY_ID, 1000, 0);
    const rows = json?.result?.rows ?? [];

    const items = rows.map((r: any) => ({
      rewardAmount: Number(r.reward_amount ?? 0),
      userCount: Number(r.user_count ?? 0),
    }));

    const rewardedUsers = items.reduce((sum: number, it: any) => sum + (it.userCount || 0), 0);

    return NextResponse.json({
      items,
      totals: { rewardedUsers },
      meta: { updatedAt: new Date().toISOString(), source: "dune" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
