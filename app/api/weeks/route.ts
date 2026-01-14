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

export async function GET(req: Request) {
  try {
    // Your weekly trend query
    const WEEKS_QUERY_ID = 6485315;

    // Optional query params: ?limit=30
    const { searchParams } = new URL(req.url);
    const limitParam = Number(searchParams.get("limit") ?? 30);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 30;

    const json = await fetchDuneResults(WEEKS_QUERY_ID, 1000, 0);
    const rows = json?.result?.rows ?? [];

    // rows already sorted DESC by your SQL, we slice to requested limit
    const weeks = rows.slice(0, limit).map((r: any) => ({
      weekNumber: Number(r.week_number),
      weekLabel: String(r.week_label),
      weekStartDate: String(r.week_start_date),
      totalUsdcAmount: Number(r.total_usdc_amount ?? 0),
      totalUniqueUsers: Number(r.total_unique_users ?? 0),
    }));

    return NextResponse.json({
      weeks,
      meta: { updatedAt: new Date().toISOString(), source: "dune", limit, hasMore: rows.length > limit },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
