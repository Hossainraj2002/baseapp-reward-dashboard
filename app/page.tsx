"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import CreatorFooter from "./_components/CreatorFooter";

type OverviewResponse = {
  allTime: { totalUsdcDistributed: number; totalUniqueUsers: number };
  latestWeek: {
    weekNumber: number;
    weekStartDate: string | null;
    totalUsdcDistributed: number;
    uniqueUsers: number;
  };
  meta: { updatedAt: string; source: string };
};

type BreakdownResponse = {
  items: { rewardAmount: number; userCount: number }[];
  totals: { rewardedUsers: number };
  meta: { updatedAt: string; source: string };
};

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
  };
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

export default function Home() {
  const router = useRouter();

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownResponse | null>(null);
  const [weekly, setWeekly] = useState<WeeklyLbResponse | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 10;

  const [loading, setLoading] = useState({
    overview: true,
    breakdown: true,
    weekly: true,
  });

  const [error, setError] = useState<string>("");

  const offset = useMemo(() => page * limit, [page, limit]);

  // Overview
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading((s) => ({ ...s, overview: true }));
        const res = await fetch("/api/overview", { cache: "no-store" });
        const json = (await res.json()) as OverviewResponse & { error?: string };
        if (!res.ok) throw new Error(json?.error ?? "Failed to load overview");
        if (!cancelled) setOverview(json);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load overview");
      } finally {
        if (!cancelled) setLoading((s) => ({ ...s, overview: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Breakdown
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading((s) => ({ ...s, breakdown: true }));
        const res = await fetch("/api/breakdown/latest", { cache: "no-store" });
        const json = (await res.json()) as BreakdownResponse & { error?: string };
        if (!res.ok) throw new Error(json?.error ?? "Failed to load breakdown");
        if (!cancelled) setBreakdown(json);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load breakdown");
      } finally {
        if (!cancelled) setLoading((s) => ({ ...s, breakdown: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Weekly leaderboard (Top 10, paginated)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading((s) => ({ ...s, weekly: true }));

        const qs = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
        });
        if (search.trim()) qs.set("search", search.trim());

        const res = await fetch(`/api/leaderboard/weekly?${qs.toString()}`, {
          cache: "no-store",
        });

        const json = (await res.json()) as WeeklyLbResponse & { error?: string };
        if (!res.ok) throw new Error(json?.error ?? "Failed to load leaderboard");

        if (!cancelled) setWeekly(json);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load leaderboard");
      } finally {
        if (!cancelled) setLoading((s) => ({ ...s, weekly: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offset, search, limit]);

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
    setSearch(searchInput.trim().toLowerCase());
  }

  const weekLabel = overview?.latestWeek?.weekNumber
    ? `Week ${overview.latestWeek.weekNumber}`
    : "Latest week";

  return (
    <div className="wrap">
      <div className="header">
        <div className="brand">
          <div className="logo">
            <Image src="/logo.png" alt="Logo" width={28} height={28} />
          </div>
          <div>
            <div className="title">Baseapp Reward Dashboard</div>
            <div className="subtitle">Rewards snapshot (cached onchain)</div>
          </div>
        </div>

        <div className="weekPill">{weekLabel}</div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {/* KPI cards */}
      <div className="grid">
        <div className="card">
          <div className="label">All-time USDC</div>
          <div className="value">
            {loading.overview ? "…" : usdc(overview?.allTime.totalUsdcDistributed ?? 0)}
          </div>
        </div>

        <div className="card">
          <div className="label">All-time users</div>
          <div className="value">{loading.overview ? "…" : nf(overview?.allTime.totalUniqueUsers ?? 0)}</div>
        </div>

        <div className="card">
          <div className="label">This week USDC</div>
          <div className="value">
            {loading.overview ? "…" : usdc(overview?.latestWeek.totalUsdcDistributed ?? 0)}
          </div>
        </div>

        <div className="card">
          <div className="label">This week users</div>
          <div className="value">{loading.overview ? "…" : nf(overview?.latestWeek.uniqueUsers ?? 0)}</div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="section">
        <div className="sectionHeader">
          <div className="sectionTitle">Current week breakdown</div>
          <div className="sectionMeta">
            {loading.breakdown ? "Loading…" : `${nf(breakdown?.totals.rewardedUsers ?? 0)} rewarded users`}
          </div>
        </div>

        <div className="breakdown">
          {(breakdown?.items ?? []).map((it) => (
            <div key={it.rewardAmount} className="breakRow">
              <div className="badge">{usdc(it.rewardAmount)}</div>
              <div className="breakRight">{nf(it.userCount)} users</div>
            </div>
          ))}

          {!loading.breakdown && (breakdown?.items?.length ?? 0) === 0 ? (
            <div className="muted">No breakdown data.</div>
          ) : null}
        </div>
      </div>

      {/* Weekly leaderboard */}
      <div className="section">
        <div className="sectionHeader">
          <div className="sectionTitle">Weekly leaderboard</div>
          <div className="sectionMeta">Top {limit}</div>
        </div>

        <div className="hint">Click any user address to visit user profile.</div>

        <form className="search" onSubmit={onSearchSubmit}>
          <input
            className="searchInput"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by address (0x...)"
          />
          <button className="searchBtn" type="submit">
            Search
          </button>
        </form>

        <div className="table">
          <div className="thead">
            <div>#</div>
            <div>User</div>
            <div className="right">This week</div>
          </div>

          {loading.weekly ? (
            <div className="muted">Loading leaderboard…</div>
          ) : (
            (weekly?.rows ?? []).map((r) => (
              <button
                type="button"
                className="trow"
                key={`${r.rank}-${r.user.address}`}
                onClick={() => router.push(`/find/${r.user.address}`)}
              >
                <div className="rank">{r.rank}</div>
                <div className="user">{shortAddr(r.user.address)}</div>
                <div className="right strong">{usdc(r.thisWeekReward)}</div>
              </button>
            ))
          )}

          {!loading.weekly && (weekly?.rows?.length ?? 0) === 0 ? <div className="muted">No results.</div> : null}
        </div>

        <div className="pager">
          <button className="pagerBtn" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} type="button">
            Prev
          </button>

          <div className="pagerMid">Page {page + 1}</div>

          <button className="pagerBtn" onClick={() => setPage((p) => p + 1)} disabled={!weekly?.meta?.hasMore} type="button">
            Next
          </button>
        </div>
      </div>

      {/* subtle creator + tip */}
      <div style={{ marginTop: 14 }}>
        <CreatorFooter />
      </div>

      <style jsx>{`
        .wrap {
          max-width: 420px;
          margin: 0 auto;
          padding: 14px;
          padding-bottom: 88px; /* leave room for BottomNav from layout */
          background: #ffffff;
          color: #0f172a;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
        }

        .header {
          position: sticky;
          top: 0;
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(8px);
          padding: 10px 0 12px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          z-index: 10;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .logo {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid #e2e8f0;
          background: #fff;
          flex: 0 0 auto;
        }

        .title {
          font-size: 16px;
          font-weight: 900;
          letter-spacing: -0.2px;
          line-height: 1.1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 240px;
        }

        .subtitle {
          font-size: 12px;
          color: #64748b;
          margin-top: 2px;
          font-weight: 700;
        }

        .weekPill {
          background: #1d4ed8;
          color: white;
          padding: 8px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
          flex: 0 0 auto;
        }

        .error {
          margin: 12px 0;
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #b91c1c;
          padding: 10px 12px;
          border-radius: 14px;
          font-size: 12px;
          font-weight: 700;
        }

        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 14px;
        }

        .card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          padding: 12px;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
        }

        .label {
          font-size: 11px;
          color: #64748b;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }

        .value {
          font-size: 20px;
          font-weight: 900;
          margin-top: 8px;
        }

        .section {
          margin-top: 14px;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          padding: 12px;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
        }

        .sectionHeader {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
        }

        .sectionTitle {
          font-size: 14px;
          font-weight: 900;
        }

        .sectionMeta {
          font-size: 12px;
          color: #1d4ed8;
          font-weight: 900;
          white-space: nowrap;
        }

        .hint {
          margin-top: 6px;
          font-size: 12px;
          color: #64748b;
          font-weight: 700;
        }

        .breakdown {
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .breakRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 10px;
          border-radius: 14px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
        }

        .badge {
          background: #eff6ff;
          color: #1d4ed8;
          font-weight: 900;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          border: 1px solid #dbeafe;
        }

        .breakRight {
          font-size: 12px;
          color: #0f172a;
          font-weight: 900;
        }

        .search {
          margin-top: 10px;
          display: flex;
          gap: 8px;
        }

        .searchInput {
          flex: 1;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 10px 12px;
          font-size: 13px;
          outline: none;
        }

        .searchInput:focus {
          border-color: #1d4ed8;
          box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.12);
        }

        .searchBtn {
          border: 1px solid #1d4ed8;
          background: #1d4ed8;
          color: white;
          font-weight: 900;
          padding: 10px 12px;
          border-radius: 14px;
          font-size: 13px;
        }

        .table {
          margin-top: 10px;
        }

        .thead {
          display: grid;
          grid-template-columns: 42px 1fr 90px;
          gap: 8px;
          font-size: 11px;
          font-weight: 900;
          color: #64748b;
          padding: 0 6px 8px;
        }

        .trow {
          width: 100%;
          display: grid;
          grid-template-columns: 42px 1fr 90px;
          gap: 8px;
          align-items: center;
          padding: 10px 6px;
          border-top: 1px solid #e2e8f0;
          font-size: 13px;
          background: transparent;
          border: none;
          text-align: left;
          cursor: pointer;
        }

        .trow:active {
          opacity: 0.7;
        }

        .rank {
          font-weight: 900;
          color: #1d4ed8;
        }

        .user {
          font-weight: 900;
        }

        .right {
          text-align: right;
        }

        .strong {
          font-weight: 900;
        }

        .pager {
          margin-top: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .pagerBtn {
          border: 1px solid #e2e8f0;
          background: #ffffff;
          border-radius: 14px;
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 900;
        }

        .pagerBtn:disabled {
          opacity: 0.5;
        }

        .pagerMid {
          font-size: 12px;
          color: #64748b;
          font-weight: 800;
        }

        .muted {
          margin-top: 10px;
          font-size: 12px;
          color: #64748b;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
