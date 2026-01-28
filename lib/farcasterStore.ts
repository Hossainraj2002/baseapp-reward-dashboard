import fs from 'fs';
import path from 'path';

export type FarcasterUserLite = {
  fid: number;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
};

type FarcasterMapOk = FarcasterUserLite & {
  status: 'ok';
};

type FarcasterMapNotFound = {
  status: 'not_found';
};

type FarcasterMapError = {
  status: 'error';
};

type FarcasterMapEntry = (FarcasterMapOk | FarcasterMapNotFound | FarcasterMapError) & {
  updated_at_utc?: string;
  [k: string]: unknown;
};

type FarcasterMapFile = Record<string, unknown>;

function isEthAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

export function normalizeAddressLower(address: string): string | null {
  const a = address.trim();
  if (!isEthAddress(a)) return null;
  return a.toLowerCase();
}

export function readFarcasterMap(): FarcasterMapFile {
  const p = path.join(process.cwd(), 'data', 'farcaster_map.json');
  try {
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf8');
    const obj = JSON.parse(raw) as unknown;
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return {};
    return obj as FarcasterMapFile;
  } catch {
    return {};
  }
}

function asEntry(v: unknown): FarcasterMapEntry | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  return v as FarcasterMapEntry;
}

function toLite(entry: FarcasterMapEntry): FarcasterUserLite | null {
  if (entry.status !== 'ok') return null;

  const fid = typeof entry.fid === 'number' ? entry.fid : null;
  if (fid == null) return null;

  const username = typeof entry.username === 'string' ? entry.username : null;
  const display_name = typeof entry.display_name === 'string' ? entry.display_name : null;
  const pfp_url = typeof entry.pfp_url === 'string' ? entry.pfp_url : null;

  return { fid, username, display_name, pfp_url };
}

export function lookupFarcasterUserByAddress(address: string): FarcasterUserLite | null {
  const key = normalizeAddressLower(address);
  if (!key) return null;

  const map = readFarcasterMap();
  const entry = asEntry(map[key]);
  if (!entry) return null;

  return toLite(entry);
}

export function lookupFarcasterUsersByAddresses(addresses: string[]): Record<string, FarcasterUserLite | null> {
  const map = readFarcasterMap();
  const out: Record<string, FarcasterUserLite | null> = {};

  for (const a of addresses) {
    const key = normalizeAddressLower(a);
    if (!key) continue;

    const entry = asEntry(map[key]);
    out[key] = entry ? toLite(entry) : null;
  }

  return out;
}
