import { NextResponse } from "next/server";

const DUNE_API_BASE = "https://api.dune.com/api/v1/query";

async function fetchDuneResults(queryId: number) {
  const apiKey = process.env.DUNE_API_KEY;
  if (!apiKey) throw new Error("Missing DUNE_API_KEY in .env.local");

  const url = `${DUNE_API_BASE}/${queryId}/results?limit=1000`;

  const res = await fetch(url, {
    headers: { "x-dune-api-key": apiKey },
    // Prevent Next.js from caching during dev; we’ll add caching later
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
    // Your query IDs
    const ALL_TIME_TOTALS = 6485295;
    const LATEST_WEEK_TOTALS = 6494290;

    const [allTimeJson, latestWeekJson] = await Promise.all([
      fetchDuneResults(ALL_TIME_TOTALS),
      fetchDuneResults(LATEST_WEEK_TOTALS),
    ]);

    // Dune response typically includes result.rows
    const allTimeRow = allTimeJson?.result?.rows?.[0];
    const latestWeekRow = latestWeekJson?.result?.rows?.[0];

    if (!allTimeRow || !latestWeekRow) {
      return NextResponse.json(
        { error: "No rows returned from Dune queries." },
        { status: 500 }
      );
    }

    // Map to your OverviewResponse shape
    const body = {
      allTime: {
        totalUsdcDistributed: Number(allTimeRow.total_usdc_distributed ?? 0),
        totalUniqueUsers: Number(allTimeRow.total_unique_users ?? 0),
      },
      latestWeek: {
        // Your latest-week query currently only returns totals + unique users
        // weekStartDate/weekLabel can be added later by joining with 6485315
        totalUsdcDistributed: Number(
          latestWeekRow.total_usdc_distributed_latest_week ?? 0
        ),
        uniqueUsers: Number(latestWeekRow.unique_users_latest_week ?? 0),
      },
      meta: {
        updatedAt: new Date().toISOString(),
        source: "dune",
      },
    };

    return NextResponse.json(body);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
