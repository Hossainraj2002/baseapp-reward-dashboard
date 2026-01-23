import fs from 'fs';
import path from 'path';
import process from 'process';
import {
  createPublicClient,
  http,
  parseAbiItem,
  formatUnits,
  getAddress,
} from 'viem';
import { base } from 'viem/chains';

// -----------------------------
// CONFIG
// -----------------------------
const RPC_URLS = [
  'https://base-rpc.publicnode.com',
  'https://mainnet.base.org',
];

const USDC_ADDRESS = getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
const REWARD_DISTRIBUTOR = getAddress('0x3D483c284bA397c1aB05E7f74593a79952a812ac');
const FIRST_REWARD_BLOCK = 33259888n;

const DATA_DIR = path.join(process.cwd(), 'data');

const PATH_OVERVIEW = path.join(DATA_DIR, 'overview.json');
const PATH_WEEKLY = path.join(DATA_DIR, 'weekly.json');
const PATH_LB_WEEKLY_LATEST = path.join(DATA_DIR, 'leaderboard_weekly_latest.json');
const PATH_LB_ALL_TIME = path.join(DATA_DIR, 'leaderboard_all_time.json');
const PATH_FARCASTER_MAP = path.join(DATA_DIR, 'farcaster_map.json');
const PATH_STATE = path.join(DATA_DIR, '_indexer_state.json');

// Stability knobs for free RPCs
const CHUNK_SIZE_BLOCKS = 9_000n;
const PAUSE_MS_BETWEEN_CHUNKS = 350;
const PAUSE_MS_BETWEEN_BLOCK_FETCH = 50;

// HTTP timeout
const HTTP_TIMEOUT_MS = 30_000;

// Retry knobs (fast failover)
const MAX_RETRIES_PER_CHUNK = 2;
const BASE_BACKOFF_MS = 400;

// If a range times out, we split it until this minimum range
const MIN_SPLIT_RANGE_BLOCKS = 200n;

// -----------------------------
// WEEK DEFINITION (MATCH YOUR TABLE)
// -----------------------------
const WEEK_1_START_UTC = '2025-07-23T00:00:00.000Z';
const WEEK_SECONDS = 7 * 24 * 60 * 60;

function getWeekKeyFromUnixSeconds(tsSec) {
  const anchor = Math.floor(Date.parse(WEEK_1_START_UTC) / 1000);
  const t = Number(tsSec);

  const delta = t - anchor;
  const weekIndex = Math.floor(delta / WEEK_SECONDS); // 0-based
  const weekStartSec = anchor + weekIndex * WEEK_SECONDS;

  const d = new Date(weekStartSec * 1000);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function getWeekNumberFromWeekKey(weekKeyYYYYMMDD) {
  const anchorMs = new Date(WEEK_1_START_UTC).getTime();
  const wkMs = new Date(`${weekKeyYYYYMMDD}T00:00:00.000Z`).getTime();
  const diffDays = Math.floor((wkMs - anchorMs) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

function formatWeekLabel(weekNumber, weekKeyYYYYMMDD) {
  const d = new Date(`${weekKeyYYYYMMDD}T00:00:00.000Z`);
  const fmt = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `Week ${weekNumber} – ${fmt.format(d).replace(',', '')}`;
}

// -----------------------------
// Helpers
// -----------------------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, obj) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function addDaysIsoDate(isoDateYYYYMMDD, days) {
  const d = new Date(`${isoDateYYYYMMDD}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function usdcToString(valueBigInt) {
  return formatUnits(valueBigInt, 6);
}

// Safe parse decimal USDC string -> bigint (6 decimals)
function usdcStringToBigInt(s) {
  // accepts "12.3456" or "12" etc
  const str = String(s).trim();
  if (!str) return 0n;
  const neg = str.startsWith('-');
  const clean = neg ? str.slice(1) : str;

  const [whole, frac = ''] = clean.split('.');
  const fracPadded = (frac + '000000').slice(0, 6);
  const bi = BigInt(whole || '0') * 1_000_000n + BigInt(fracPadded || '0');
  return neg ? -bi : bi;
}

function toShortAddress(addr) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function pctChange(current, previous) {
  if (previous === 0n) return null;
  const diff = current - previous;
  const bp = (diff * 10000n) / previous;
  const sign = bp < 0n ? '-' : '';
  const abs = bp < 0n ? -bp : bp;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${sign}${whole.toString()}.${frac.toString().padStart(2, '0')}`;
}

function makeClient(rpcUrl) {
  return createPublicClient({
    chain: base,
    transport: http(rpcUrl, { timeout: HTTP_TIMEOUT_MS }),
  });
}

function isTimeoutError(err) {
  const msg = (err?.message || String(err)).toLowerCase();
  return msg.includes('timed out') || msg.includes('took too long');
}

function isRetryableRpcError(err) {
  const msg = (err?.message || String(err)).toLowerCase();
  return (
    msg.includes('http request failed') ||
    msg.includes('status: 429') ||
    msg.includes('status: 503') ||
    msg.includes('rate limit') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('took too long') ||
    msg.includes('no backend is currently healthy')
  );
}

async function getLogsOnceOnRpc({ rpcUrl, address, event, args, fromBlock, toBlock }) {
  const client = makeClient(rpcUrl);
  return client.getLogs({ address, event, args, fromBlock, toBlock });
}

async function getLogsWithFallbackOnce({ address, event, args, fromBlock, toBlock }) {
  let lastErr = null;

  for (const rpcUrl of RPC_URLS) {
    for (let attempt = 0; attempt <= MAX_RETRIES_PER_CHUNK; attempt++) {
      try {
        const logs = await getLogsOnceOnRpc({
          rpcUrl,
          address,
          event,
          args,
          fromBlock,
          toBlock,
        });
        return { logs, rpcUrlUsed: rpcUrl };
      } catch (err) {
        lastErr = err;

        if (!isRetryableRpcError(err)) throw err;

        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(`RPC error on ${rpcUrl} (attempt ${attempt + 1}/${MAX_RETRIES_PER_CHUNK + 1}). Backing off ${backoff}ms...`);
        await sleep(backoff);
      }
    }

    console.warn(`RPC ${rpcUrl} is failing for this range. Switching...`);
  }

  throw lastErr || new Error('All RPCs failed.');
}

async function getLogsWithFallbackSplit({ address, event, args, fromBlock, toBlock }) {
  try {
    return await getLogsWithFallbackOnce({ address, event, args, fromBlock, toBlock });
  } catch (err) {
    if (!isTimeoutError(err)) throw err;

    const range = toBlock - fromBlock;
    if (range <= MIN_SPLIT_RANGE_BLOCKS) {
      throw err;
    }

    const mid = fromBlock + (range / 2n);

    console.warn(`Timeout on range ${fromBlock}->${toBlock}. Splitting into ${fromBlock}->${mid} and ${mid + 1n}->${toBlock}`);

    const left = await getLogsWithFallbackSplit({
      address, event, args, fromBlock, toBlock: mid,
    });

    const right = await getLogsWithFallbackSplit({
      address, event, args, fromBlock: mid + 1n, toBlock,
    });

    return { logs: [...left.logs, ...right.logs], rpcUrlUsed: left.rpcUrlUsed };
  }
}

// -----------------------------
// Load EXISTING history into memory
// -----------------------------
function loadExistingHistoryIntoMaps({ weekTotals, weekUsers, userAllTime, userWeeks }) {
  const existingWeekly = readJsonSafe(PATH_WEEKLY, null);
  const existingAllTime = readJsonSafe(PATH_LB_ALL_TIME, null);

  const weekKeys =
    (existingWeekly && Array.isArray(existingWeekly.week_keys) && existingWeekly.week_keys) ||
    (existingAllTime && Array.isArray(existingAllTime.week_keys) && existingAllTime.week_keys) ||
    [];

  // Ensure week sets exist
  for (const wk of weekKeys) {
    if (!weekUsers.has(wk)) weekUsers.set(wk, new Set());
    if (!weekTotals.has(wk)) weekTotals.set(wk, 0n);
  }

  // Rebuild per-user per-week from leaderboard_all_time.json (most reliable)
  if (existingAllTime && Array.isArray(existingAllTime.rows)) {
    for (const row of existingAllTime.rows) {
      const addr = getAddress(row.address);
      if (!userWeeks.has(addr)) userWeeks.set(addr, new Map());

      const weeksObj = row.weeks || {};
      for (const [wk, usdcStr] of Object.entries(weeksObj)) {
        const v = usdcStringToBigInt(usdcStr);
        if (v <= 0n) continue;

        // userWeeks
        const uw = userWeeks.get(addr);
        uw.set(wk, (uw.get(wk) || 0n) + v);

        // weekTotals
        weekTotals.set(wk, (weekTotals.get(wk) || 0n) + v);

        // weekUsers
        if (!weekUsers.has(wk)) weekUsers.set(wk, new Set());
        weekUsers.get(wk).add(addr);

        // userAllTime
        userAllTime.set(addr, (userAllTime.get(addr) || 0n) + v);
      }
    }
  }
}

// -----------------------------
// Main
// -----------------------------
async function main() {
  ensureDir(DATA_DIR);

  if (!fs.existsSync(PATH_FARCASTER_MAP)) {
    writeJsonAtomic(PATH_FARCASTER_MAP, {});
  }

  const state = readJsonSafe(PATH_STATE, { lastProcessedBlock: null });

  // get latest block with fallback
  let latestBlock = null;
  for (const rpcUrl of RPC_URLS) {
    try {
      latestBlock = await makeClient(rpcUrl).getBlockNumber();
      break;
    } catch {
      console.warn(`Failed to read latest block from ${rpcUrl}. Trying next...`);
    }
  }
  if (latestBlock == null) throw new Error('Could not read latest block from any RPC.');

  const startBlock =
    state.lastProcessedBlock != null ? BigInt(state.lastProcessedBlock) + 1n : FIRST_REWARD_BLOCK;

  console.log('--- Baseapp Reward Dashboard Indexer ---');
  console.log('Start block:', startBlock.toString());
  console.log('Latest block:', latestBlock.toString());

  // Create maps
  const weekTotals = new Map();   // weekKey -> bigint
  const weekUsers = new Map();    // weekKey -> Set(address)
  const userAllTime = new Map();  // address -> bigint
  const userWeeks = new Map();    // address -> Map(weekKey -> bigint)

  // IMPORTANT: Load existing history so we don't overwrite it
  loadExistingHistoryIntoMaps({ weekTotals, weekUsers, userAllTime, userWeeks });

  if (startBlock > latestBlock) {
    console.log('Nothing new to index. Rewriting outputs from existing data only...');
  } else {
    const transferEvent = parseAbiItem(
      'event Transfer(address indexed from, address indexed to, uint256 value)'
    );

    const blockTsCache = new Map();

    async function getBlockTimestamp(blockNumber) {
      const key = blockNumber.toString();
      if (blockTsCache.has(key)) return blockTsCache.get(key);

      let lastErr = null;
      for (const rpcUrl of RPC_URLS) {
        try {
          const b = await makeClient(rpcUrl).getBlock({ blockNumber });
          const ts = b.timestamp;
          blockTsCache.set(key, ts);
          await sleep(PAUSE_MS_BETWEEN_BLOCK_FETCH);
          return ts;
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error('Failed to fetch block timestamp from any RPC.');
    }

    let from = startBlock;
    while (from <= latestBlock) {
      const to =
        from + CHUNK_SIZE_BLOCKS - 1n <= latestBlock ? from + CHUNK_SIZE_BLOCKS - 1n : latestBlock;

      console.log(`Fetching logs: blocks ${from} -> ${to}`);

      let logs = [];
      let rpcUsed = null;

      try {
        const res = await getLogsWithFallbackSplit({
          address: USDC_ADDRESS,
          event: transferEvent,
          args: { from: REWARD_DISTRIBUTOR },
          fromBlock: from,
          toBlock: to,
        });
        logs = res.logs;
        rpcUsed = res.rpcUrlUsed;
      } catch (err) {
        console.error('RPC getLogs failed for range:', from.toString(), to.toString());
        console.error('Error:', err?.message || err);
        console.error('Re-run later to resume.');
        process.exit(1);
      }

      console.log(`Got ${logs.length} logs (RPC used: ${rpcUsed})`);

      for (const log of logs) {
        const toAddr = getAddress(log.args.to);
        const value = log.args.value;

        const ts = await getBlockTimestamp(log.blockNumber);
        const wk = getWeekKeyFromUnixSeconds(ts);

        // weekTotals
        weekTotals.set(wk, (weekTotals.get(wk) || 0n) + value);

        // weekUsers
        if (!weekUsers.has(wk)) weekUsers.set(wk, new Set());
        weekUsers.get(wk).add(toAddr);

        // userAllTime
        userAllTime.set(toAddr, (userAllTime.get(toAddr) || 0n) + value);

        // userWeeks
        if (!userWeeks.has(toAddr)) userWeeks.set(toAddr, new Map());
        const uw = userWeeks.get(toAddr);
        uw.set(wk, (uw.get(wk) || 0n) + value);
      }

      state.lastProcessedBlock = Number(to);
      writeJsonAtomic(PATH_STATE, state);

      from = to + 1n;
      await sleep(PAUSE_MS_BETWEEN_CHUNKS);
    }
  }

  // Build sorted week keys from the totals map
  const allWeekKeys = Array.from(weekTotals.keys()).sort();
  if (allWeekKeys.length === 0) {
    console.log('No transfers found from distributor. Check addresses and start block.');
    process.exit(0);
  }

  const latestWeekKey = allWeekKeys[allWeekKeys.length - 1];
  const prevWeekKey = allWeekKeys.length >= 2 ? allWeekKeys[allWeekKeys.length - 2] : null;

  const allTimeTotal = Array.from(userAllTime.values()).reduce((a, b) => a + b, 0n);
  const allTimeUniqueUsers = userAllTime.size;

  const latestWeekTotal = weekTotals.get(latestWeekKey) || 0n;
  const latestWeekUniqueUsers = (weekUsers.get(latestWeekKey) || new Set()).size;

  // Breakdown buckets for latest week (by user total)
  const latestWeekUsers = weekUsers.get(latestWeekKey) || new Set();
  const bucketCounts = new Map(); // weeklyTotalBigInt -> countUsers

  for (const addr of latestWeekUsers) {
    const weeklyTotal = (userWeeks.get(addr)?.get(latestWeekKey)) || 0n;
    if (weeklyTotal === 0n) continue;
    bucketCounts.set(weeklyTotal, (bucketCounts.get(weeklyTotal) || 0) + 1);
  }

  const breakdown = Array.from(bucketCounts.entries())
    .map(([value, count]) => ({ reward_usdc: usdcToString(value), users: count }))
    .sort((a, b) => Number(b.reward_usdc) - Number(a.reward_usdc));

  const overview = {
    generated_at_utc: new Date().toISOString(),
    chain: 'base',
    token: { symbol: 'USDC', address: USDC_ADDRESS, decimals: 6 },
    reward_distributor: REWARD_DISTRIBUTOR,
    first_reward_block: FIRST_REWARD_BLOCK.toString(),
    all_time: { total_usdc: usdcToString(allTimeTotal), unique_users: allTimeUniqueUsers },
    latest_week: {
      week_start_utc: latestWeekKey,
      week_end_utc: addDaysIsoDate(latestWeekKey, 7),
      total_usdc: usdcToString(latestWeekTotal),
      unique_users: latestWeekUniqueUsers,
      breakdown,
    },
  };

  const weekly = {
    generated_at_utc: new Date().toISOString(),
    week_keys: allWeekKeys,
    weeks: allWeekKeys.map((wk) => {
      const weekNumber = getWeekNumberFromWeekKey(wk);
      return {
        week_number: weekNumber,
        week_label: formatWeekLabel(weekNumber, wk),
        week_start_date_utc: `${wk} 00:00`,
        week_start_utc: wk,
        week_end_utc: addDaysIsoDate(wk, 7),
        total_usdc_amount: Number(usdcToString(weekTotals.get(wk) || 0n)),
        total_unique_users: (weekUsers.get(wk) || new Set()).size,
      };
    }),
  };

  const latestRows = [];
  for (const addr of latestWeekUsers) {
    const thisWeek = userWeeks.get(addr)?.get(latestWeekKey) || 0n;
    const prevWeek = prevWeekKey ? userWeeks.get(addr)?.get(prevWeekKey) || 0n : 0n;
    const allTime = userAllTime.get(addr) || 0n;
    latestRows.push({
      address: addr,
      user_display: toShortAddress(addr),
      this_week_usdc: usdcToString(thisWeek),
      previous_week_usdc: usdcToString(prevWeek),
      pct_change: pctChange(thisWeek, prevWeek),
      all_time_usdc: usdcToString(allTime),
    });
  }
  latestRows.sort((a, b) => Number(b.this_week_usdc) - Number(a.this_week_usdc));

  const leaderboardWeeklyLatest = {
    generated_at_utc: new Date().toISOString(),
    latest_week_start_utc: latestWeekKey,
    latest_week_end_utc: addDaysIsoDate(latestWeekKey, 7),
    previous_week_start_utc: prevWeekKey,
    rows: latestRows.map((r, i) => ({ rank: i + 1, ...r })),
  };

  const allTimeRows = [];
  for (const [addr, total] of userAllTime.entries()) {
    const weeksMap = userWeeks.get(addr) || new Map();
    const weeksObj = {};
    for (const wk of allWeekKeys) {
      const v = weeksMap.get(wk) || 0n;
      if (v > 0n) weeksObj[wk] = usdcToString(v);
    }

    const weeksEarned = Object.keys(weeksObj).sort();

    allTimeRows.push({
      address: addr,
      user_display: toShortAddress(addr),
      total_usdc: usdcToString(total),
      total_weeks_earned: weeksEarned.length,
      weeks: weeksObj,
    });
  }
  allTimeRows.sort((a, b) => Number(b.total_usdc) - Number(a.total_usdc));

  const leaderboardAllTime = {
    generated_at_utc: new Date().toISOString(),
    week_keys: allWeekKeys,
    rows: allTimeRows.map((r, i) => ({ all_time_rank: i + 1, ...r })),
  };

  writeJsonAtomic(PATH_OVERVIEW, overview);
  writeJsonAtomic(PATH_WEEKLY, weekly);
  writeJsonAtomic(PATH_LB_WEEKLY_LATEST, leaderboardWeeklyLatest);
  writeJsonAtomic(PATH_LB_ALL_TIME, leaderboardAllTime);

  console.log('Done. Wrote:');
  console.log('-', path.relative(process.cwd(), PATH_OVERVIEW));
  console.log('-', path.relative(process.cwd(), PATH_WEEKLY));
  console.log('-', path.relative(process.cwd(), PATH_LB_WEEKLY_LATEST));
  console.log('-', path.relative(process.cwd(), PATH_LB_ALL_TIME));
  console.log('-', path.relative(process.cwd(), PATH_FARCASTER_MAP));
  console.log('-', path.relative(process.cwd(), PATH_STATE));
}

main().catch((e) => {
  console.error('Fatal error:', e?.message || e);
  process.exit(1);
});
