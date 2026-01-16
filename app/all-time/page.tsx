"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;

type AllTimeResponse = {
  columns: string[];
  rows: Row[];
  meta: {
    updatedAt: string;
    source: string;
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
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

function prettyHeader(k: string) {
  if (k === "all_time_rank") return "Rank";
  if (k === "user_address") return "User";
  if (k === "total_usdc_earned") return "Total";
  if (k === "total_weeks_earned") return "Weeks";
  if (/^week_\d+$/.test(k)) return k.replace("_", " ");
  return k.replaceAll("_", " ");
}

function formatCell(k: string, v: unknown) {
  const num = Number(v ?? 0);

  if (k === "total_usdc_earned") return usdc(num);
  if (k === "total_weeks_earned") return nf(num);
  if (/^week_\d+$/.test(k)) return usdc(num);

  if (k === "all_time_rank") return nf(Number(v ?? 0));
  return String(v ?? "");
}

export default function AllTimePage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(0);
  const limit = 10;

  const offset = useMemo(() => page * limit, [page]);

  const [data, setData] = useState<AllTimeResponse | null>(null);
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

        // ✅ Snapshot-based API (NO Dune)
        const res = await fetch(`/api/leaderboard/alltime?${qs.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as AllTimeResponse;

        if (!res.ok) throw new Error(json?.error ?? "Failed to load all-time leaderboard");
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

  const columns = data?.columns ?? [
    "all_time_rank",
    "user_address",
    "total_usdc_earned",
    "total_weeks_earned",
  ];
  const rows = data?.rows ?? [];
  const total = data?.meta?.total ?? 0;
  const hasMore = Boolean(data?.meta?.hasMore);

  // ✅ Sticky columns: Rank + User + Total (so Total always visible)
  const stickyCols = ["all_time_rank", "user_address", "total_usdc_earned"];

  return (
    <div className="bg-white text-slate-900">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-extrabold">All-time leaderboard</div>
          <div className="mt-1 text-xs font-bold text-slate-500">
            Full dataset • paginated • updated from snapshots
          </div>
        </div>

        {/* Optional: keep a small shortcut to Find */}
        <Link
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold"
          href="/find"
        >
          Find
        </Link>
      </div>

      <form className="flex gap-2" onSubmit={onSubmit}>
        <input
          className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm font-bold outline-none focus:border-[#1E4FFF]"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by address (0x...)"
        />
        <button
          className="rounded-2xl bg-[#1E4FFF] px-4 py-3 text-sm font-extrabold text-white"
          type="submit"
        >
          Search
        </button>
      </form>

      {err ? (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
          {err}
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        {loading ? (
          <div className="text-sm font-bold text-slate-600">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm font-bold text-slate-600">No rows returned.</div>
        ) : (
          <div className="overflow-x-auto">
            {/* IMPORTANT:
               We use fixed min widths + sticky offsets so Rank/User/Total stay visible.
            */}
            <div style={{ minWidth: 820 }}>
              {/* Header */}
              <div className="grid border-b border-slate-200 bg-white text-[11px] font-extrabold uppercase tracking-wide text-slate-500"
                   style={{ gridTemplateColumns: "72px 170px 130px 90px repeat(50, 110px)" }}>
                {columns.map((k) => (
                  <div
                    key={k}
                    className={[
                      "px-3 py-2 whitespace-nowrap",
                      stickyCols.includes(k) ? "sticky bg-white z-20" : "",
                      k === "all_time_rank" ? "left-0" : "",
                      k === "user_address" ? "left-[72px]" : "",
                      k === "total_usdc_earned" ? "left-[242px]" : "",
                      stickyCols.includes(k) ? "shadow-[6px_0_10px_rgba(15,23,42,0.04)]" : "",
                    ].join(" ")}
                  >
                    {prettyHeader(k)}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {rows.map((r, idx) => (
                <div
                  key={`${String(r.user_address ?? idx)}-${idx}`}
                  className="grid border-b border-slate-100 bg-white text-sm font-bold"
                  style={{ gridTemplateColumns: "72px 170px 130px 90px repeat(50, 110px)" }}
                >
                  {columns.map((k) => {
                    const raw = r[k];
                    const isUser = k === "user_address";
                    const address = isUser ? String(raw ?? "") : "";

                    const cell = isUser && address.startsWith("0x")
                      ? (
                        <Link
                          className="font-extrabold text-slate-900 underline underline-offset-2"
                          href={`/find/${address.toLowerCase()}`}
                        >
                          {shortAddr(address)}
                        </Link>
                      )
                      : <span>{formatCell(k, raw)}</span>;

                    return (
                      <div
                        key={k}
                        className={[
                          "px-3 py-2 whitespace-nowrap",
                          stickyCols.includes(k) ? "sticky bg-white z-10" : "",
                          k === "all_time_rank" ? "left-0" : "",
                          k === "user_address" ? "left-[72px]" : "",
                          k === "total_usdc_earned" ? "left-[242px]" : "",
                          stickyCols.includes(k) ? "shadow-[6px_0_10px_rgba(15,23,42,0.04)]" : "",
                        ].join(" ")}
                      >
                        {cell}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 text-xs font-bold text-slate-500">
          Click on any user address to visit user profile.
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0 || loading}
          type="button"
        >
          Prev
        </button>

        <div className="text-xs font-extrabold text-slate-500">
          Page {page + 1} · {nf(total)} users
        </div>

        <button
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold"
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasMore || loading}
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
}
