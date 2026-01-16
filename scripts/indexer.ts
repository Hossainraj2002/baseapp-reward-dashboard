/* scripts/indexer.ts
   Builds FREE cached JSON snapshots from Base RPC (NO Dune).
   Robust version: smaller chunks + exponential backoff retries + gentle pacing.

   Source:
   - USDC on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
   - Reward distributor: 0x3D483c284bA397c1aB05E7f74593a79952a812ac

   Outputs (in /data):
   - weekly.json
   - overview.json
   - breakdown_latest.json
   - leaderboard_weekly_latest.json
   - leaderboard_all_time.json
*/

import fs from "node:fs";
import path from "node:path";

const RPC_URL = process.env.BASE_RPC_URL || "https://1rpc.io/base"; // ✅ use a more stable free RPC by default
const START_BLOCK = Number(process.env.START_BLOCK || "33259888");

// USDC on Base + distributor
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const REWARD_FROM = "0x3D483c284bA397c1aB05E7f74593a79952a812ac";

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "state.json");

type RpcResponse<T> = { result: T; error?: { message?: string; code?: number } };

function hex(n: number) {
  return "0x" + n.toString(16);
}

function padTopicAddress(addr: string) {
  const a = addr.toLowerCase().replace(/^0x/, "");
  return "0x" + a.padStart(64, "0");
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableRpcError(msg: string) {
  const m = msg.toLowerCase();
  return (
    m.includes("rpc http 503") ||
    m.includes("no backend") ||
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("rate") ||
    m.includes("too many") ||
    m.includes("-32011") ||
    m.includes("gateway") ||
    m.includes("temporarily") ||
    m.includes("overloaded")
  );
}

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const maxTries = 8;

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`RPC HTTP ${res.status}: ${text}`);
      }

      const json = (await res.json()) as RpcResponse<T>;
      if (json.error) {
        throw new Error(`RPC error: ${json.error.message || "unknown"} (code ${json.error.code ?? "?"})`);
      }

      return json.result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);

      const retryable = isRetryableRpcError(msg);
      if (!retryable || attempt === maxTries) throw e;

      // Exponential backoff: 1s, 2s, 4s, 8s... capped at 30s
      const wait = Math.min(30000, 1000 * 2 ** (attempt - 1));
      console.log(`RPC busy (${attempt}/${maxTries}). Waiting ${wait}ms...`);
      await sleep(wait);
    }
  }

  // unreachable
  throw new Error("RPC failed unexpectedly");
}

async function getLatestBlock(): Promise<number> {
  const b = await rpc<string>("eth_blockNumber");
  return parseInt(b, 16);
}

type EthLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
};

type EthBlock = { timestamp: string };

function decodeAddressFromTopic(topic: string) {
  return ("0x" + topic.slice(-40)).toLowerCase();
}

function decodeUint256ToUSDC(dataHex: string) {
  const raw = BigInt(dataHex);
  const usdc = Number(raw / BigInt(1000000));
  return usdc;
}

function weekStartUTCFromTimestamp(tsSec: number) {
  // Week anchor: Wednesday 00:00 UTC
  const anchor = Date.parse("2025-07-23T00:00:00Z") / 1000;
  const diff = tsSec - anchor;
  const weeks = Math.floor(diff / (7 * 24 * 3600));
  return anchor + weeks * 7 * 24 * 3600;
}

function isoDateUTC(tsSec: number) {
  return new Date(tsSec * 1000).toISOString().slice(0, 10);
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readState(): { lastProcessedBlock?: number } {
  try {
    const s = fs.readFileSync(STATE_PATH, "utf8");
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function writeJSON(file: string, obj: unknown) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");
}

async function getBlockTimestampCached(blockNumber: number, cache: Map<number, number>) {
  const hit = cache.get(blockNumber);
  if (hit) return hit;

  const b = await rpc<EthBlock>("eth_getBlockByNumber", [hex(blockNumber), false]);
  const ts = parseInt(b.timestamp, 16);
  cache.set(blockNumber, ts);
  return ts;
}

async function fetchLogs(fromBlock: number, toBlock: number): Promise<EthLog[]> {
  return rpc<EthLog[]>("eth_getLogs", [
    {
      fromBlock: hex(fromBlock),
      toBlock: hex(toBlock),
      address: USDC,
      topics: [TRANSFER_TOPIC0, padTopicAddress(REWARD_FROM)],
    },
  ]);
}

type UserAgg = {
  allTime: number;
  weeks: Map<number, number>;
};

function weekNumberFromWeekStartTs(weekStartTs: number) {
  const anchor = Date.parse("2025-07-23T00:00:00Z") / 1000;
  return Math.floor((weekStartTs - anchor) / (7 * 24 * 3600)) + 1;
}

function weekLabel(weekStartISO: string, weekNo: number) {
  const d = new Date(weekStartISO + "T00:00:00Z");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mmm = months[d.getUTCMonth()];
  const yyyy = d.getUTCFullYear();
  return `Week ${weekNo} – ${dd} ${mmm} ${yyyy}`;
}

async function main() {
  ensureDir(DATA_DIR);

  console.log("RPC:", RPC_URL);
  console.log("START_BLOCK:", START_BLOCK);

  const latest = await getLatestBlock();
  console.log("LATEST_BLOCK:", latest);

  const FROM = START_BLOCK;
  const TO = latest;

  const CHUNK = 1200; // ✅ smaller chunk avoids RPC overload
  const PACE_MS = 120; // ✅ small sleep between chunks
  const blockTsCache = new Map<number, number>();

  const weeklySum = new Map<string, number>();
  const weeklyUsers = new Map<string, Set<string>>();
  const users = new Map<string, UserAgg>();

  console.log(`Scanning logs from ${FROM} -> ${TO} in chunks of ${CHUNK}...`);

  for (let start = FROM; start <= TO; start += CHUNK) {
    const end = Math.min(TO, start + CHUNK - 1);
    process.stdout.write(`Chunk ${start} -> ${end} ... `);

    const logs = await fetchLogs(start, end);
    console.log(`logs=${logs.length}`);

    for (const lg of logs) {
      const blockNum = parseInt(lg.blockNumber, 16);
      const ts = await getBlockTimestampCached(blockNum, blockTsCache);

      const from = decodeAddressFromTopic(lg.topics[1]);
      if (from !== REWARD_FROM.toLowerCase()) continue;

      const to = decodeAddressFromTopic(lg.topics[2]);
      const amount = decodeUint256ToUSDC(lg.data);

      const ws = weekStartUTCFromTimestamp(ts);
      const wsISO = isoDateUTC(ws);
      const wn = weekNumberFromWeekStartTs(ws);

      weeklySum.set(wsISO, (weeklySum.get(wsISO) || 0) + amount);

      if (!weeklyUsers.has(wsISO)) weeklyUsers.set(wsISO, new Set());
      weeklyUsers.get(wsISO)!.add(to);

      if (!users.has(to)) users.set(to, { allTime: 0, weeks: new Map() });
      const u = users.get(to)!;
      u.allTime += amount;
      u.weeks.set(wn, (u.weeks.get(wn) || 0) + amount);
    }

    // ✅ gentle pacing to keep public RPC healthy
    await sleep(PACE_MS);
  }

  const weeklyList = Array.from(weeklySum.keys())
    .sort((a, b) => (a < b ? 1 : -1))
    .map((wsISO) => {
      const wsTs = Date.parse(wsISO + "T00:00:00Z") / 1000;
      const wn = weekNumberFromWeekStartTs(wsTs);
      return {
        weekNumber: wn,
        weekLabel: weekLabel(wsISO, wn),
        weekStartDate: wsISO,
        totalUsdcAmount: weeklySum.get(wsISO) || 0,
        totalUniqueUsers: weeklyUsers.get(wsISO)?.size || 0,
      };
    });

  const latestWeek = weeklyList[0];
  const latestWeekNo = latestWeek?.weekNumber || 0;
  const prevWeekNo = latestWeekNo > 1 ? latestWeekNo - 1 : 0;

  const weeklyRowsFull = Array.from(users.entries())
    .map(([address, agg]) => {
      const thisWeek = agg.weeks.get(latestWeekNo) || 0;
      const prevWeek = prevWeekNo ? agg.weeks.get(prevWeekNo) || 0 : 0;
      return {
        user_address: address,
        this_week_reward: thisWeek,
        previous_week_reward: prevWeek,
        all_time_reward: agg.allTime,
      };
    })
    .filter((r) => r.this_week_reward > 0)
    .sort((a, b) => b.this_week_reward - a.this_week_reward);

  let lastVal = -1;
  let rank = 0;
  const weeklyRowsRanked = weeklyRowsFull.map((r, idx) => {
    if (r.this_week_reward !== lastVal) {
      rank = idx + 1;
      lastVal = r.this_week_reward;
    }
    return { rank, ...r };
  });

  const breakdownMap = new Map<number, number>();
  for (const r of weeklyRowsFull) {
    breakdownMap.set(r.this_week_reward, (breakdownMap.get(r.this_week_reward) || 0) + 1);
  }
  const breakdownItems = Array.from(breakdownMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([rewardAmount, userCount]) => ({ rewardAmount, userCount }));

  const maxWeek = Math.max(0, ...weeklyList.map((w) => w.weekNumber));

  const allTimeRowsFull = Array.from(users.entries())
    .map(([address, agg]) => {
      const totalWeeksEarned = Array.from(agg.weeks.values()).filter((v) => v > 0).length;
      const row: Record<string, number | string> = {
        all_time_rank: 0,
        user_address: address,
        total_usdc_earned: agg.allTime,
        total_weeks_earned: totalWeeksEarned,
      };

      for (let w = 1; w <= maxWeek; w++) row[`week_${w}`] = agg.weeks.get(w) || 0;
      return row;
    })
    .filter((r) => Number(r.total_usdc_earned) > 0)
    .sort((a, b) => Number(b.total_usdc_earned) - Number(a.total_usdc_earned));

  allTimeRowsFull.forEach((r, i) => {
    r.all_time_rank = i + 1;
  });

  const overview = {
    allTime: {
      totalUsdcDistributed: allTimeRowsFull.reduce((sum, r) => sum + Number(r.total_usdc_earned), 0),
      totalUniqueUsers: allTimeRowsFull.length,
    },
    latestWeek: {
      weekNumber: latestWeekNo,
      weekStartDate: latestWeek?.weekStartDate || null,
      totalUsdcDistributed: latestWeek?.totalUsdcAmount || 0,
      uniqueUsers: latestWeek?.totalUniqueUsers || 0,
    },
    meta: {
      updatedAt: new Date().toISOString(),
      source: "base-rpc",
      startBlock: START_BLOCK,
      latestBlock: latest,
    },
  };

  writeJSON(path.join(DATA_DIR, "weekly.json"), { weeks: weeklyList, meta: overview.meta });
  writeJSON(path.join(DATA_DIR, "overview.json"), overview);
  writeJSON(path.join(DATA_DIR, "breakdown_latest.json"), {
    items: breakdownItems,
    totals: { rewardedUsers: weeklyRowsFull.length },
    meta: overview.meta,
  });
  writeJSON(path.join(DATA_DIR, "leaderboard_weekly_latest.json"), {
    rows: weeklyRowsRanked,
    meta: { ...overview.meta, weekNumber: latestWeekNo },
  });

  const columns = ["all_time_rank", "user_address", "total_usdc_earned", "total_weeks_earned"].concat(
    Array.from({ length: maxWeek }, (_, i) => `week_${i + 1}`)
  );

  writeJSON(path.join(DATA_DIR, "leaderboard_all_time.json"), {
    columns,
    rows: allTimeRowsFull,
    meta: overview.meta,
  });

  writeJSON(STATE_PATH, { lastProcessedBlock: latest, updatedAt: overview.meta.updatedAt });

  console.log("✅ Done. Wrote snapshots to /data");
}

main().catch((e) => {
  console.error("ERROR:", e?.message || e);
  process.exit(1);
});
