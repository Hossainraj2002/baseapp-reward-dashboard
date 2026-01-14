import { NextResponse } from "next/server";

const DUNE_API_BASE = "https://api.dune.com/api/v1/query";
const NEYNAR_API_BASE = "https://api.neynar.com/v2/farcaster";

type NeynarUser = {
  fid: number;
  username: string;
  display_name?: string;
  pfp_url?: string;
  custody_address?: string;
  verified_addresses?: {
    eth_addresses?: string[];
  };
};

async function fetchDuneResults(queryId: number, limit = 1000, offset = 0) {
  const apiKey = process.env.DUNE_API_KEY;
  if (!apiKey) throw new Error("Missing DUNE_API_KEY");

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

async function fetchNeynarUsersByAddresses(addresses: string[]) {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) throw new Error("Missing NEYNAR_API_KEY");

  if (addresses.length === 0) return [] as NeynarUser[];

  // Neynar expects comma-separated addresses
  const url = `${NEYNAR_API_BASE}/user/bulk-by-address?addresses=${encodeURIComponent(
    addresses.join(",")
  )}`;

  const res = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
      accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Neynar API error (${res.status}): ${text}`);
  }

  const json = await res.json();
  // Usually { users: [...] }, but handle array fallback too
  const users = (json?.users ?? json ?? []) as NeynarUser[];
  return Array.isArray(users) ? users : [];
}

function looksLikeAddress(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s.trim());
}

export async function GET(req: Request) {
  try {
    const WEEKLY_LB_QUERY_ID = 6491337;

    const { searchParams } = new URL(req.url);
    const limitParam = Number(searchParams.get("limit") ?? 10);
    const offsetParam = Number(searchParams.get("offset") ?? 0);
    const searchRaw = (searchParams.get("search") ?? "").trim();

    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 10;
    const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0;
    const search = searchRaw.toLowerCase();

    // Fetch a large set once; filter/paginate in API (v1 simple)
    const dune = await fetchDuneResults(WEEKLY_LB_QUERY_ID, 1000, 0);
    let rows = dune?.result?.rows ?? [];

    // Search: address exact, else partial address match (name search comes later)
    if (search) {
      if (looksLikeAddress(search)) {
        rows = rows.filter((r: any) => String(r.user_address ?? "").toLowerCase() === search);
      } else {
        rows = rows.filter((r: any) => String(r.user_address ?? "").toLowerCase().includes(search));
      }
    }

    const pageRows = rows.slice(offset, offset + limit);

    const addresses = pageRows
      .map((r: any) => String(r.user_address ?? "").toLowerCase())
      .filter((a: string) => looksLikeAddress(a));

    // Neynar enrichment
    const neynarUsers = await fetchNeynarUsersByAddresses(addresses);

    // Map: ANY known eth address (custody + verified) -> user
    const neynarMap = new Map<string, NeynarUser>();
    for (const u of neynarUsers) {
      const custody = (u.custody_address ?? "").toLowerCase();
      if (custody) neynarMap.set(custody, u);

      const verified = u.verified_addresses?.eth_addresses ?? [];
      for (const a of verified) {
        const key = String(a).toLowerCase();
        if (key) neynarMap.set(key, u);
      }
    }

    const enriched = pageRows.map((r: any) => {
      const addr = String(r.user_address ?? "").toLowerCase();
      const fc = neynarMap.get(addr);

      return {
        rank: Number(r.rank ?? 0),
        user: {
          address: addr as `0x${string}`,
          hasFarcaster: Boolean(fc),
          fid: fc?.fid ?? null,
          username: fc?.username ?? null,
          displayName: fc?.display_name ?? null,
          pfpUrl: fc?.pfp_url ?? null,
        },
        thisWeekReward: Number(r.this_week_reward ?? 0),
        previousWeekReward: Number(r.previous_week_reward ?? 0),
        allTimeReward: Number(r.all_time_reward ?? 0),
      };
    });

    return NextResponse.json({
      rows: enriched,
      meta: {
        updatedAt: new Date().toISOString(),
        source: "dune+neynar",
        limit,
        offset,
        hasMore: offset + limit < rows.length,
        filteredCount: rows.length,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
