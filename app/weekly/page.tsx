"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type WeeklyLbRow = {
  rank: number;
  user: { address: `0x${string}` };
  thisWeekReward: number;
  previousWeekReward: number;
  allTimeReward: number;
};

type WeeklyLbResponse = {
  rows: WeeklyLbRow[];
  meta: {
    updatedAt: string;
    source: string;
    limit: number;
    offset: number;
    hasMore: boolean;
    weekNumber?: number;
    weekStartDate?: string;
  };
  error?: string;
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

export default function WeeklyPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 10;

  const offset = useMemo(() => page * limit, [page, limit]);

  const [data, setData] = useState<WeeklyLbResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        const qs = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
        });
        if (search.trim()) qs.set("search", search.trim());

        const res = await fetch(`/api/leaderboard/weekly?${qs.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as WeeklyLbResponse;

        if (!res.ok) throw new Error(json?.error || "Failed to load weekly leaderboard");
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
  }, [offset, search]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
    setSearch(searchInput.trim().toLowerCase());
  }

  const rows = data?.rows ?? [];
  const hasMore = Boolean(data?.meta?.hasMore);
  const weekTag =
    data?.meta?.weekNumber ? `Week ${data.meta.weekNumber}` : "Latest week";

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto w-full max-w-md px-4 pb-24 pt-5">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-extrabold tracking-tight">
              Rewards for posting
            </div>
            <div className="mt-0.5 text-xs font-semibold text-slate-500">
              Weekly leaderboard • {weekTag}
            </div>
          </div>

          <span className="rounded-full bg-[#1E4FFF] px-3 py-1.5 text-xs font-extrabold text-white">
            {weekTag}
          </span>
        </div>

        {/* Search */}
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            className="h-11 flex-1 rounded-2xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#1E4FFF] focus:ring-4 focus:ring-[#1E4FFF]/10"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search wallet (0x...)"
          />
          <button
            type="submit"
            className="h-11 rounded-2xl bg-[#1E4FFF] px-4 text-sm font-extrabold text-white"
          >
            Search
          </button>
        </form>

        {err ? (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {err}
          </div>
        ) : null}

        {/* Table */}
        <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-[52px_1fr_110px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
            <div>Rank</div>
            <div>User</div>
            <div className="text-right">This week</div>
          </div>

          {loading ? (
            <div className="p-3 text-sm font-semibold text-slate-600">
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-3 text-sm font-semibold text-slate-600">
              No results.
            </div>
          ) : (
            rows.map((r) => (
              <div
                key={`${r.rank}-${r.user.address}`}
                className="grid grid-cols-[52px_1fr_110px] gap-2 px-3 py-3 text-sm"
              >
                <div className="font-extrabold text-[#1E4FFF]">{r.rank}</div>

                <div className="min-w-0">
                  <Link
                    href={`/find/${r.user.address}`}
                    className="truncate font-extrabold text-slate-900 underline-offset-2 hover:underline"
                  >
                    {shortAddr(r.user.address)}
                  </Link>
                  <div className="mt-0.5 text-xs font-semibold text-slate-500">
                    Prev: {usdc(r.previousWeekReward)} • All-time:{" "}
                    {usdc(r.allTimeReward)}
                  </div>
                </div>

                <div className="text-right font-extrabold">
                  {usdc(r.thisWeekReward)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Helper text */}
        <div className="mt-3 text-center text-xs font-semibold text-slate-500">
          Click any user address to open profile.
        </div>

        {/* Pager */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold disabled:opacity-50"
          >
            Prev
          </button>

          <div className="text-xs font-extrabold text-slate-500">
            Page {page + 1}
          </div>

          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore || loading}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold disabled:opacity-50"
          >
            Next
          </button>
        </div>

        {/* Bottom nav placeholder note:
            We will make ONE persistent BottomNav in layout later.
            For now, links so you can navigate.
        */}
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-extrabold"
          >
            Home
          </Link>
          <Link
            href="/weekly"
            className="rounded-2xl bg-[#1E4FFF] px-3 py-2 text-sm font-extrabold text-white"
          >
            Weekly
          </Link>
          <Link
            href="/all-time"
            className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-extrabold"
          >
            All-time
          </Link>
          <Link
            href="/profile"
            className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-extrabold"
          >
            Profile
          </Link>
          <Link
            href="/find"
            className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-extrabold"
          >
            Find
          </Link>
        </div>
      </div>
    </main>
  );
}
