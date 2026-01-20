import fs from "fs";
import path from "path";
import process from "process";
import dotenv from "dotenv";
import { NeynarAPIClient, Configuration } from "@neynar/nodejs-sdk";

/**
 * Phase 6: Wallet -> Farcaster mapping
 * - Reads addresses from data/leaderboard_all_time.json
 * - Updates data/farcaster_map.json
 * - Uses Neynar SDK (free tier)
 * - Loads .env.local explicitly (Node does not auto-load it on Windows)
 */

// Load environment variables from .env.local (and .env as fallback)
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const DATA_DIR = path.join(process.cwd(), "data");
const PATH_ALL_TIME = path.join(DATA_DIR, "leaderboard_all_time.json");
const PATH_MAP = path.join(DATA_DIR, "farcaster_map.json");

// Stability knobs (free tier friendly)
const MAX_ADDRESSES_PER_RUN = 500;
const PAUSE_MS_BETWEEN_CALLS = 250;
const RETRIES = 2;
const RETRY_BACKOFF_MS = 800;

// If no user is found for an address, store a tombstone so we don't query forever.
const WRITE_NOT_FOUND_TOMBSTONE = true;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
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

function pickUserFromResponse(resp) {
  const users =
    resp?.users ||
    resp?.result?.users ||
    resp?.data?.users ||
    (resp?.user ? [resp.user] : []);

  if (!Array.isArray(users) || users.length === 0) return null;
  return users[0];
}

async function callWithRetry(fn) {
  let lastErr = null;
  for (let i = 0; i <= RETRIES; i++) {
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

async function main() {
  ensureDir(DATA_DIR);

  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    console.error("Missing NEYNAR_API_KEY in environment (.env.local).");
    console.error("Checked:", path.join(process.cwd(), ".env.local"));
    process.exit(1);
  }

  if (!fs.existsSync(PATH_ALL_TIME)) {
    console.error("Missing data/leaderboard_all_time.json. Run the indexer first.");
    process.exit(1);
  }

  // Neynar SDK init (per their docs)
  const config = new Configuration({ apiKey });
  const client = new NeynarAPIClient(config);

  const allTime = readJson(PATH_ALL_TIME);
  const map = readJsonSafe(PATH_MAP, {});

  const addresses = [];
  for (const r of allTime?.rows || []) {
    if (r?.address && isEthAddress(r.address)) addresses.push(toLowerAddress(r.address));
  }

  const unique = Array.from(new Set(addresses));
  const unmapped = unique.filter((a) => !map[a]);

  console.log("--- Farcaster Mapping Script (Phase 6) ---");
  console.log("Loaded NEYNAR_API_KEY from .env.local:", apiKey ? "YES" : "NO");
  console.log("Total addresses in all-time leaderboard:", unique.length);
  console.log("Already mapped:", unique.length - unmapped.length);
  console.log("Unmapped:", unmapped.length);
  console.log("Will process up to:", MAX_ADDRESSES_PER_RUN);
  console.log("-----------------------------------------");

  const todo = unmapped.slice(0, MAX_ADDRESSES_PER_RUN);

  let mappedCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;

  for (let idx = 0; idx < todo.length; idx++) {
    const addr = todo[idx];
    process.stdout.write(`(${idx + 1}/${todo.length}) ${addr} ... `);

    try {
      const resp = await callWithRetry(async () => {
        // SDK v3 supports bulk lookup by addresses.
        // This matches Neynar "fetching user based on ethereum address" concept.
        if (typeof client.fetchBulkUsersByEthOrSolAddress === "function") {
          return await client.fetchBulkUsersByEthOrSolAddress({ addresses: [addr] });
        }
        if (typeof client.lookupUserByEthAddress === "function") {
          return await client.lookupUserByEthAddress({ address: addr });
        }
        throw new Error(
          "Neynar SDK method not found. Expected fetchBulkUsersByEthOrSolAddress or lookupUserByEthAddress."
        );
      });

      const user = pickUserFromResponse(resp);

      if (!user) {
        process.stdout.write("no user\n");
        notFoundCount++;
        if (WRITE_NOT_FOUND_TOMBSTONE) {
          map[addr] = { status: "not_found", updated_at_utc: new Date().toISOString() };
          writeJsonAtomic(PATH_MAP, map);
        }
      } else {
        const fid = user.fid ?? user.user?.fid;
        const username = user.username ?? user.user?.username ?? null;
        const display_name = user.display_name ?? user.user?.display_name ?? null;
        const pfp_url = user.pfp_url ?? user.user?.pfp_url ?? null;

        map[addr] = {
          status: "ok",
          fid,
          username,
          display_name,
          pfp_url,
          updated_at_utc: new Date().toISOString()
        };

        writeJsonAtomic(PATH_MAP, map);
        mappedCount++;
        process.stdout.write(`fid=${fid} username=${username || "-"}\n`);
      }
    } catch (e) {
      errorCount++;
      const msg = e?.message || String(e);
      process.stdout.write(`ERROR: ${msg}\n`);
    }

    await sleep(PAUSE_MS_BETWEEN_CALLS);
  }

  console.log("-----------------------------------------");
  console.log("Done.");
  console.log("Mapped:", mappedCount);
  console.log("Not found:", notFoundCount);
  console.log("Errors:", errorCount);
  console.log("Wrote:", path.relative(process.cwd(), PATH_MAP));
}

main().catch((e) => {
  console.error("Fatal error:", e?.message || e);
  process.exit(1);
});
