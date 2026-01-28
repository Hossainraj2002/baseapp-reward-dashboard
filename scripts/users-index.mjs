import fs from "fs";
import path from "path";
import process from "process";
import dotenv from "dotenv";
import { NeynarAPIClient, Configuration } from "@neynar/nodejs-sdk";

/**
 * V2: Bulk wallet -> Farcaster user store indexer
 *
 * IMPORTANT: fetchBulkUsersByEthOrSolAddress returns an object keyed by address:
 * {
 *   "0xabc...": [User, User, ...],
 *   "0xdef...": []
 * }
 *
 * Option B selection rule: For each address, choose the FIRST returned user for that address.
 */

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const DATA_DIR = path.join(process.cwd(), "data");
const PATH_ALL_TIME = path.join(DATA_DIR, "leaderboard_all_time.json");
const PATH_WEEKLY_LATEST = path.join(DATA_DIR, "leaderboard_weekly_latest.json");
const PATH_MAP = path.join(DATA_DIR, "farcaster_map.json");

const BATCH_SIZE = 300; // <= 350 per Neynar docs
const PAUSE_MS_BETWEEN_CALLS = 300;
const RETRIES = 3;
const RETRY_BACKOFF_MS = 700;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return readJson(filePath);
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, obj) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function isEthAddress(a) {
  return /^0x[a-fA-F0-9]{40}$/.test(a);
}

function toLowerAddress(a) {
  return a.toLowerCase();
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function callWithRetry(fn) {
  let lastErr = null;
  for (let i = 0; i < RETRIES; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const backoff = RETRY_BACKOFF_MS * Math.pow(2, i);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

function isPlainObject(x) {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/**
 * Convert SDK response into address -> users[] map.
 * The docs show response is an object keyed by address. :contentReference[oaicite:3]{index=3}
 */
function extractAddressMap(resp) {
  // Sometimes SDKs wrap data; handle a few safe shapes.
  if (isPlainObject(resp)) {
    // If it already looks like { "0x..": [...] }
    const keys = Object.keys(resp);
    const looksLikeAddressMap = keys.some((k) => isEthAddress(k) && Array.isArray(resp[k]));
    if (looksLikeAddressMap) return resp;

    // Common wrappers
    if (isPlainObject(resp.data)) return extractAddressMap(resp.data);
    if (isPlainObject(resp.result)) return extractAddressMap(resp.result);
  }
  return {};
}

function safeString(x) {
  return typeof x === "string" ? x : null;
}

function safeNumber(x) {
  return typeof x === "number" ? x : null;
}

function safeNumberFromString(x) {
  if (typeof x === "number") return x;
  if (typeof x !== "string") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function extractUserRecord(user) {
  const fid = safeNumber(user?.fid);

  const username = safeString(user?.username);
  const display_name = safeString(user?.display_name);
  const pfp_url = safeString(user?.pfp_url);

  const bio_text =
    safeString(user?.profile?.bio?.text) ||
    safeString(user?.profile?.bio) ||
    null;

  const follower_count = safeNumber(user?.follower_count);
  const following_count = safeNumber(user?.following_count);

  // Newer API may have score at top-level; keep both safely
  const score = safeNumber(user?.score) ?? safeNumberFromString(user?.score);
  const neynar_user_score =
    safeNumber(user?.experimental?.neynar_user_score) ??
    safeNumberFromString(user?.experimental?.neynar_user_score);

  const custody_address = safeString(user?.custody_address);

  const verifications = Array.isArray(user?.verifications)
    ? user.verifications.filter((x) => typeof x === "string")
    : [];

  const verified_eth =
    Array.isArray(user?.verified_addresses?.eth_addresses)
      ? user.verified_addresses.eth_addresses.filter((x) => typeof x === "string")
      : [];

  const verified_sol =
    Array.isArray(user?.verified_addresses?.sol_addresses)
      ? user.verified_addresses.sol_addresses.filter((x) => typeof x === "string")
      : [];

  const primary_eth = safeString(user?.verified_addresses?.primary?.eth_address);
  const primary_sol = safeString(user?.verified_addresses?.primary?.sol_address);

  return {
    fid,
    username,
    display_name,
    pfp_url,
    profile: {
      bio: { text: bio_text }
    },
    follower_count,
    following_count,
    score,
    experimental: {
      neynar_user_score
    },
    custody_address,
    verifications,
    verified_addresses: {
      eth_addresses: verified_eth,
      sol_addresses: verified_sol,
      primary: {
        eth_address: primary_eth,
        sol_address: primary_sol
      }
    }
  };
}

function normalizeStore(store) {
  if (!isPlainObject(store)) return {};
  return store;
}

function shouldRefetchExisting(entry, force) {
  if (!entry) return true;
  if (!isPlainObject(entry)) return true;

  const status = safeString(entry.status);
  if (status === "ok") return false;
  if (status === "error") return true;

  // if previous run wrongly wrote not_found, allow force re-check
  if (status === "not_found") return force;

  // unknown status -> allow refetch
  return true;
}

async function main() {
  ensureDir(DATA_DIR);

  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    console.error("Missing NEYNAR_API_KEY in environment (.env.local).");
    process.exit(1);
  }

  if (!fs.existsSync(PATH_ALL_TIME)) {
    console.error("Missing data/leaderboard_all_time.json. Run the indexer first.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const force = args.includes("--force") || process.env.FORCE === "1";

  // Load store (never delete existing)
  const storeRaw = readJsonSafe(PATH_MAP, {});
  const store = normalizeStore(storeRaw);

  // Load addresses from all-time leaderboard
  const allTime = readJson(PATH_ALL_TIME);
  const addresses = [];

  for (const r of allTime?.rows || []) {
    if (r?.address && isEthAddress(r.address)) {
      addresses.push(toLowerAddress(r.address));
    }
  }

  // Also include weekly latest (cheap)
  if (fs.existsSync(PATH_WEEKLY_LATEST)) {
    const latest = readJson(PATH_WEEKLY_LATEST);
    for (const r of latest?.rows || []) {
      if (r?.address && isEthAddress(r.address)) {
        addresses.push(toLowerAddress(r.address));
      }
    }
  }

  const unique = Array.from(new Set(addresses));

  const toFetch = unique.filter((a) => shouldRefetchExisting(store[a], force));

  console.log("--- Users Index Script (V2, fixed) ---");
  console.log("Total addresses found:", unique.length);
  console.log("Need fetch (this run):", toFetch.length);
  console.log("Batch size:", BATCH_SIZE);
  console.log("Force re-check not_found:", force ? "YES" : "NO");
  console.log("--------------------------------------");

  if (toFetch.length === 0) {
    store.__meta = {
      schema: 2,
      updated_at_utc: new Date().toISOString(),
      source: "neynar bulk-by-address"
    };
    writeJsonAtomic(PATH_MAP, store);
    console.log("No work needed. Store meta refreshed.");
    return;
  }

  const client = new NeynarAPIClient(new Configuration({ apiKey }));

  let mappedOk = 0;
  let mappedNotFound = 0;
  let mappedError = 0;

  const batches = chunk(toFetch, BATCH_SIZE);

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const csv = batch.join(",");

    console.log(`\n[${bi + 1}/${batches.length}] Fetching ${batch.length} addresses...`);

    let resp;
    try {
      // Use the SDK method exactly as docs show: addresses is a comma-separated string. :contentReference[oaicite:4]{index=4}
      resp = await callWithRetry(async () => {
        return await client.fetchBulkUsersByEthOrSolAddress({
          addresses: csv,
          xNeynarExperimental: true
        });
      });
    } catch (e) {
      mappedError += batch.length;
      console.log("Batch ERROR:", e?.message || String(e));
      for (const addr of batch) {
        // never delete, only update status
        store[addr] = { status: "error", updated_at_utc: new Date().toISOString() };
      }
      store.__meta = {
        schema: 2,
        updated_at_utc: new Date().toISOString(),
        source: "neynar bulk-by-address"
      };
      writeJsonAtomic(PATH_MAP, store);
      await sleep(PAUSE_MS_BETWEEN_CALLS);
      continue;
    }

    const addressMap = extractAddressMap(resp);

    for (const addr of batch) {
      const arr = Array.isArray(addressMap[addr]) ? addressMap[addr] : [];

      if (arr.length === 0) {
        store[addr] = {
          status: "not_found",
          updated_at_utc: new Date().toISOString()
        };
        mappedNotFound++;
        continue;
      }

      // Option B: first user returned for this address
      const chosen = arr[0];
      const record = extractUserRecord(chosen);

      store[addr] = {
        status: "ok",
        updated_at_utc: new Date().toISOString(),
        ...record
      };
      mappedOk++;
    }

    store.__meta = {
      schema: 2,
      updated_at_utc: new Date().toISOString(),
      source: "neynar bulk-by-address"
    };

    writeJsonAtomic(PATH_MAP, store);

    console.log(`Batch done. ok +${mappedOk}, not_found +${mappedNotFound}, error +${mappedError}`);
    await sleep(PAUSE_MS_BETWEEN_CALLS);
  }

  console.log("\n--------------------------------");
  console.log("Done.");
  console.log("Mapped ok:", mappedOk);
  console.log("Not found:", mappedNotFound);
  console.log("Errors:", mappedError);
  console.log("Wrote:", path.relative(process.cwd(), PATH_MAP));
}

main().catch((e) => {
  console.error("Fatal error:", e?.message || e);
  process.exit(1);
});
