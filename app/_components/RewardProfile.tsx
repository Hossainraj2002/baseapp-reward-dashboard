"use client";

import { useEffect, useMemo, useState } from "react";

type RewardsApi = {
  address: string;
  summary: {
    totalUsdc: number;
    totalWeeks: number;
    rank: number | null;
  };
  history: Array<{ weekKey: string; amount: number }>;
  meta: { updatedAt: string; source: string };
};

function nf(n: number) {
  return new Intl.NumberFormat("en-US").format(Number.isFinite(n) ? n : 0);
}
function usdc(n: number) {
  return `$${nf(n)}`;
}
function shortAddr(a: string) {
  if (!a?.startsWith("0x") || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function RewardProfile({
  address,
  title,
  subtitle,
}: {
  address: string;
  title: string;
  subtitle?: string;
}) {
  const [data, setData] = useState<RewardsApi | null>(null);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const addr = useMemo(() => address?.toLowerCase(), [address]);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!addr || !addr.startsWith("0x")) return;

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const res = await fetch(`/api/rewards?address=${encodeURIComponent(addr)}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as RewardsApi & { error?: string };
        if (!res.ok) throw new Error(json?.error || "Failed to load rewards");
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [addr]);

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-extrabold">{title}</div>
          {subtitle ? <div className="mt-1 text-xs font-bold text-slate-500">{subtitle}</div> : null}
        </div>

        <button
          type="button"
          onClick={copyAddress}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-900"
          title="Copy address"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-extrabold text-slate-900">Wallet</div>
          <div className="font-mono text-xs text-slate-600">{shortAddr(addr)}</div>
        </div>

        {loading ? <div className="mt-3 text-sm font-bold text-slate-600">Loading…</div> : null}
        {err ? <div className="mt-3 text-sm font-bold text-red-600">{err}</div> : null}

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-slate-200 p-3">
            <div className="text-[11px] font-extrabold text-slate-500">All-time</div>
            <div className="mt-1 text-base font-extrabold">
              {data ? usdc(data.summary.totalUsdc) : "—"}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-3">
            <div className="text-[11px] font-extrabold text-slate-500">Weeks</div>
            <div className="mt-1 text-base font-extrabold">
              {data ? nf(data.summary.totalWeeks) : "—"}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-3">
            <div className="text-[11px] font-extrabold text-slate-500">Rank</div>
            <div className="mt-1 text-base font-extrabold">
              {data?.summary.rank ? nf(data.summary.rank) : "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-extrabold">Reward history</div>
          <div className="text-xs font-bold text-slate-500">Scroll</div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <div className="min-w-[520px]">
            <div className="grid grid-cols-2 gap-2 border-b border-slate-200 pb-2 text-[11px] font-extrabold text-slate-500">
              <div>Week</div>
              <div className="text-right">USDC</div>
            </div>

            {(data?.history ?? []).map((h) => (
              <div
                key={h.weekKey}
                className="grid grid-cols-2 gap-2 border-b border-slate-100 py-2 text-sm font-bold"
              >
                <div className="text-slate-900">{h.weekKey.replace("_", " ")}</div>
                <div className="text-right text-slate-900">{usdc(h.amount)}</div>
              </div>
            ))}

            {!loading && !err && (data?.history?.length ?? 0) === 0 ? (
              <div className="mt-2 text-sm font-bold text-slate-600">No history found.</div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-extrabold">Social</div>
        <div className="mt-2 text-xs font-bold text-slate-600">
          Social data will show here if we can map this wallet to a Farcaster identity.
        </div>
      </div>
    </main>
  );
}
