import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

type AllTimeFile = {
  columns: string[];
  rows: Array<Record<string, any>>;
  meta?: any;
};

function readAllTime(): AllTimeFile {
  const p = path.join(process.cwd(), "data", "leaderboard_all_time.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = (url.searchParams.get("address") || "").toLowerCase();

  if (!address.startsWith("0x") || address.length !== 42) {
    return NextResponse.json(
      { error: "Provide ?address=0x.. (42 chars)" },
      { status: 400 }
    );
  }

  const all = readAllTime();
  const row = all.rows.find(
    (r) => String(r.user_address || "").toLowerCase() === address
  );

  if (!row) {
    return NextResponse.json({
      address,
      summary: { totalUsdc: 0, totalWeeks: 0, rank: null },
      history: [],
      meta: { updatedAt: new Date().toISOString(), source: "snapshot" },
    });
  }

  // history = all week_* columns where >0
  const history: Array<{ weekKey: string; amount: number }> = [];
  for (const k of Object.keys(row)) {
    if (!/^week_\d+$/.test(k)) continue;
    const amount = Number(row[k] ?? 0);
    if (amount > 0) history.push({ weekKey: k, amount });
  }

  // sort week_1..week_n
  history.sort((a, b) => {
    const wa = Number(a.weekKey.split("_")[1] || 0);
    const wb = Number(b.weekKey.split("_")[1] || 0);
    return wa - wb;
  });

  return NextResponse.json({
    address,
    summary: {
      totalUsdc: Number(row.total_usdc_earned ?? 0),
      totalWeeks: Number(row.total_weeks_earned ?? 0),
      rank: Number(row.all_time_rank ?? 0) || null,
    },
    history,
    meta: {
      updatedAt: new Date().toISOString(),
      source: "snapshot",
    },
  });
}
