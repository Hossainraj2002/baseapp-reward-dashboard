import { NextResponse } from "next/server";

type Row = Record<string, unknown>;

export async function GET() {
  const DUNE_QUERY_ID = 6490488;
  const apiKey = process.env.DUNE_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing DUNE_API_KEY" },
      { status: 500 }
    );
  }

  const url = `https://api.dune.com/api/v1/query/${DUNE_QUERY_ID}/results?limit=2000`;

  const res = await fetch(url, {
    headers: { "x-dune-api-key": apiKey },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: "Dune API error", details: text },
      { status: 500 }
    );
  }

  const json = (await res.json()) as {
    result?: { rows?: Row[] };
  };

  return NextResponse.json({
    rows: json.result?.rows ?? [],
    meta: {
      queryId: DUNE_QUERY_ID,
      source: "dune",
      updatedAt: new Date().toISOString(),
    },
  });
}
