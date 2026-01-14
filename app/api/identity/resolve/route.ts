import { NextResponse } from "next/server";
import { createPublicClient, http, isAddress } from "viem";
import { mainnet, base } from "viem/chains";

const NEYNAR_API_BASE = "https://api.neynar.com/v2/farcaster";

// Public RPCs (fine for MVP)
const ethClient = createPublicClient({ chain: mainnet, transport: http("https://cloudflare-eth.com") });
const baseClient = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });

type NeynarUser = {
  fid: number;
  username: string;
  display_name?: string;
  pfp_url?: string;
  custody_address?: string;
  verified_addresses?: { eth_addresses?: string[] };
};

type Identity = {
  address: `0x${string}`;
  // name signals
  ensName: string | null;
  baseName: string | null;
  // farcaster signals
  farcaster: {
    hasFarcaster: boolean;
    fid: number | null;
    username: string | null;
    displayName: string | null;
    pfpUrl: string | null;
    // how we matched (helps UI confidence)
    matchType: "address" | "username" | "none";
  };
  // final display
  bestLabel: string;     // what to show as primary title
  bestSubLabel: string;  // what to show as subtitle
};

function shortAddr(a: string) {
  return a.startsWith("0x") && a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function parseAddressesFromQuery(url: URL): string[] {
  // Accept either:
  // ?addresses=0x..,0x..  OR repeated ?addresses=0x..&addresses=0x..
  const all = url.searchParams.getAll("addresses");
  const joined = all.flatMap((x) => x.split(","));
  const norm = joined.map((s) => s.trim().toLowerCase()).filter(Boolean);
  // keep only valid EVM addresses
  const valid = Array.from(new Set(norm.filter((a) => isAddress(a))));
  return valid.slice(0, 50); // safety limit
}

async function neynarBulkByAddress(addresses: string[]): Promise<NeynarUser[]> {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) throw new Error("Missing NEYNAR_API_KEY");

  if (!addresses.length) return [];

  const url =
    `${NEYNAR_API_BASE}/user/bulk-by-address?addresses=` +
    encodeURIComponent(addresses.join(","));

  const res = await fetch(url, {
    headers: { "x-api-key": apiKey, accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Neynar bulk-by-address error (${res.status}): ${text}`);
  }

  const json = await res.json();
  const users = (json?.users ?? json ?? []) as NeynarUser[];
  return Array.isArray(users) ? users : [];
}

async function neynarUserByUsername(username: string): Promise<NeynarUser | null> {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) throw new Error("Missing NEYNAR_API_KEY");

  if (!username) return null;

  const url = `${NEYNAR_API_BASE}/user/by_username?username=${encodeURIComponent(username)}`;
  const res = await fetch(url, {
    headers: { "x-api-key": apiKey, accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    // if not found, treat as null (don’t break)
    if (res.status === 404) return null;
    const text = await res.text();
    throw new Error(`Neynar by_username error (${res.status}): ${text}`);
  }

  const json = await res.json();
  // Usually json.user
  return (json?.user ?? null) as NeynarUser | null;
}

async function reverseEnsName(address: string): Promise<string | null> {
  try {
    // ENS reverse on Ethereum mainnet
    const name = await ethClient.getEnsName({ address: address as `0x${string}` });
    return name ?? null;
  } catch {
    return null;
  }
}

async function reverseBaseName(address: string): Promise<string | null> {
  try {
    // Basename reverse on Base.
    // If Base doesn’t support ENS reverse for this address, it returns null.
    const name = await baseClient.getEnsName({ address: address as `0x${string}` });
    return name ?? null;
  } catch {
    return null;
  }
}

function stripNameToUsername(name: string): string {
  // "tay.eth" -> "tay", "name.base" -> "name"
  const first = name.split(".")[0] ?? "";
  return first.trim();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const addresses = parseAddressesFromQuery(url);

    if (!addresses.length) {
      return NextResponse.json(
        { error: "Provide addresses via ?addresses=0x..,0x.. (max 50)" },
        { status: 400 }
      );
    }

    // 1) Neynar by address (best, highest confidence)
    const neynarUsers = await neynarBulkByAddress(addresses);

    // Map ANY known eth address (custody + verified) -> Neynar user
    const byAddress = new Map<string, NeynarUser>();
    for (const u of neynarUsers) {
      const custody = (u.custody_address ?? "").toLowerCase();
      if (custody && isAddress(custody)) byAddress.set(custody, u);

      const verified = u.verified_addresses?.eth_addresses ?? [];
      for (const a of verified) {
        const key = String(a).toLowerCase();
        if (key && isAddress(key)) byAddress.set(key, u);
      }
    }

    // 2) Reverse resolve names (ENS + Basename)
    const namePairs = await Promise.all(
      addresses.map(async (a) => {
        const [ensName, baseName] = await Promise.all([reverseEnsName(a), reverseBaseName(a)]);
        return { address: a, ensName, baseName };
      })
    );

    // 3) If no Neynar match by address, try username lookup using ENS/Basename label
    // We only do a small number (max 10) to avoid rate limits on MVP.
    const needUsernameLookup: { address: string; username: string }[] = [];
    for (const p of namePairs) {
      const already = byAddress.get(p.address);
      if (already) continue;

      const candidate = p.baseName ?? p.ensName;
      if (!candidate) continue;

      const uname = stripNameToUsername(candidate).toLowerCase();
      if (uname) needUsernameLookup.push({ address: p.address, username: uname });
    }

    const limited = needUsernameLookup.slice(0, 10);
    const usernameResults = await Promise.all(
      limited.map(async (x) => {
        const user = await neynarUserByUsername(x.username);
        return { address: x.address, username: x.username, user };
      })
    );

    const byUsername = new Map<string, NeynarUser>();
    for (const r of usernameResults) {
      if (r.user) byUsername.set(r.address, r.user);
    }

    // Build final identities
    const identities: Identity[] = addresses.map((addr) => {
      const names = namePairs.find((x) => x.address === addr);
      const ensName = names?.ensName ?? null;
      const baseName = names?.baseName ?? null;

      const fcByAddr = byAddress.get(addr);
      const fcByUname = byUsername.get(addr);

      const fc = fcByAddr ?? fcByUname ?? null;
      const matchType: "address" | "username" | "none" =
        fcByAddr ? "address" : fcByUname ? "username" : "none";

      // Best label logic:
      // 1) Farcaster display/name if exists
      // 2) Basename / ENS
      // 3) short address
      const bestLabel =
        (fc?.display_name && fc.display_name.trim()) ||
        (fc?.username && `@${fc.username}`) ||
        baseName ||
        ensName ||
        shortAddr(addr);

      const bestSubLabel =
        fc?.username ? `@${fc.username}` :
        baseName ? baseName :
        ensName ? ensName :
        shortAddr(addr);

      return {
        address: addr as `0x${string}`,
        ensName,
        baseName,
        farcaster: {
          hasFarcaster: Boolean(fc),
          fid: fc?.fid ?? null,
          username: fc?.username ?? null,
          displayName: fc?.display_name ?? null,
          pfpUrl: fc?.pfp_url ?? null,
          matchType,
        },
        bestLabel,
        bestSubLabel,
      };
    });

    return NextResponse.json({
      identities,
      meta: { updatedAt: new Date().toISOString(), source: "neynar+ens+basename", count: identities.length },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
