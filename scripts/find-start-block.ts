// scripts/find-start-block.ts
// Finds the FIRST block where USDC Transfer happened from the rewards sender.
// Start date: 2025-07-23 (approx)

const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const REWARD_FROM = "0x3D483c284bA397c1aB05E7f74593a79952a812ac";

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function padTopicAddress(addr: string) {
  const a = addr.toLowerCase().replace(/^0x/, "");
  return "0x" + a.padStart(64, "0");
}

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  if (!res.ok) throw new Error(`RPC HTTP ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as { result?: T; error?: unknown };
  if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
  return json.result as T;
}

async function getLatestBlock(): Promise<number> {
  const hex = await rpc<string>("eth_blockNumber");
  return parseInt(hex, 16);
}

async function getBlockTimestamp(blockNumber: number): Promise<number> {
  const hex = "0x" + blockNumber.toString(16);
  const b = await rpc<{ timestamp: string }>("eth_getBlockByNumber", [hex, false]);
  return parseInt(b.timestamp, 16);
}

async function getLogs(fromBlock: number, toBlock: number) {
  const params = [
    {
      fromBlock: "0x" + fromBlock.toString(16),
      toBlock: "0x" + toBlock.toString(16),
      address: USDC,
      topics: [TRANSFER_TOPIC0, padTopicAddress(REWARD_FROM)],
    },
  ];
  return rpc<unknown[]>("eth_getLogs", params);
}

async function findBlockByTimestamp(targetTs: number): Promise<number> {
  const latest = await getLatestBlock();
  let lo = 0;
  let hi = latest;

  // first block with timestamp >= targetTs
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const ts = await getBlockTimestamp(mid);
    if (ts >= targetTs) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

async function rangeHasAnyLogs(from: number, to: number): Promise<boolean> {
  const logs = await getLogs(from, to);
  return logs.length > 0;
}

async function findFirstLogBlockInRange(from: number, to: number): Promise<number | null> {
  if (!(await rangeHasAnyLogs(from, to))) return null;

  let lo = from;
  let hi = to;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (await rangeHasAnyLogs(lo, mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

async function main() {
  console.log("RPC:", RPC_URL);
  console.log("USDC:", USDC);
  console.log("FROM:", REWARD_FROM);

  const targetTs = Math.floor(Date.parse("2025-07-23T00:00:00Z") / 1000);
  console.log("Target date UTC 2025-07-23, ts =", targetTs);

  const approxStartBlock = await findBlockByTimestamp(targetTs);
  console.log("Approx start block by timestamp:", approxStartBlock);

  const CHUNK = 5000;
  let from = Math.max(0, approxStartBlock - CHUNK);
  const latest = await getLatestBlock();

  while (from <= latest) {
    const to = Math.min(latest, from + CHUNK - 1);
    process.stdout.write(`Scanning ${from} -> ${to} ... `);

    const has = await rangeHasAnyLogs(from, to);
    console.log(has ? "FOUND" : "none");

    if (has) {
      const first = await findFirstLogBlockInRange(from, to);
      console.log("FIRST REWARD TRANSFER BLOCK =", first);
      return;
    }

    from = to + 1;
  }

  console.log("No logs found. Check addresses / RPC.");
}

main().catch((e) => {
  console.error("ERROR:", e?.message || e);
  process.exit(1);
});
