"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";

type WeeklyLbRow = {
  rank: number;
  user_address?: string; // in case your API returns this naming
  user?: { address: `0x${string}` }; // in case your API returns nested user
  this_week_reward?: number;
  previous_week_reward?: number;
  all_time_reward?: number;

  // or camelCase if your API already maps it
  thisWeekReward?: number;
  previousWeekReward?: number;
  allTimeReward?: number;
};

type WeeklyLbResponse = {
  rows: WeeklyLbRow[];
  meta?: {
    updatedAt?: string;
    source?: string;
    limit?: number;
    offset?: number;
    hasMore?: boolean;
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

function getAddress(r: WeeklyLbRow): string {
  return (r.user?.address as string) || r.user_address || "";
}
function getThisWeek(r: WeeklyLbRow): number {
  return Number(
    r.thisWeekReward ?? r.this_week_reward ?? 0
  );
}
function getPrevWeek(r: WeeklyLbRow): number {
  return Number(
    r.previousWeekReward ?? r.previous_week_reward ?? 0
  );
}
function getAllTime(r: WeeklyLbRow): number {
  return Number(
    r.allTimeReward ?? r.all_time_reward ?? 0
  );
}

export default function WeeklyPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 10;

  const offset = useMemo(() => page * limit, [page]);

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

        if (!res.ok) {
          throw new Error(json?.error || "Failed to load weekly leaderboard");
        }

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
    setSearch(searchInput.trim());
  }

  const rows = data?.rows ?? [];
  const hasMore = Boolean(data?.meta?.hasMore);

  return (
    <div className="wrap">
      {/* Header */}
      <div className="top">
        <div>
          <div className="title">Creator Reward</div>
          <div className="sub">Rewards for posting (latest week)</div>
        </div>

        <Link className="homeBtn" href="/">
          Home
        </Link>
      </div>

      {/* Search */}
      <form className="search" onSubmit={onSubmit}>
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

      {/* Error */}
      {err ? <div className="error">{err}</div> : null}

      {/* Table */}
      <div className="card">
        <div className="thead">
          <div>#</div>
          <div>User</div>
          <div className="right">This</div>
          <div className="right">Prev</div>
          <div className="right">All</div>
        </div>

        {loading ? (
          <div className="muted">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="muted">
            No rows returned.
            <div className="muted2">
              Try removing search, or check the API:
              <div className="mono">/api/leaderboard/weekly</div>
            </div>
          </div>
        ) : (
          rows.map((r, idx) => {
            const address = getAddress(r);
            const tw = getThisWeek(r);
            const pw = getPrevWeek(r);
            const at = getAllTime(r);

            return (
              <div className="trow" key={`${address}-${idx}`}>
                <div className="rank">{r.rank ?? idx + 1}</div>

                <div className="user">
                  {address ? (
                    <Link className="userLink" href={`/user/${address}`}>
                      {shortAddr(address)}
                    </Link>
                  ) : (
                    <span className="muted2">Unknown</span>
                  )}
                </div>

                <div className="right strong">{usdc(tw)}</div>
                <div className="right">{usdc(pw)}</div>
                <div className="right">{usdc(at)}</div>
              </div>
            );
          })
        )}
      </div>

      {/* Pager */}
      <div className="pager">
        <button
          className="pagerBtn"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0 || loading}
          type="button"
        >
          Prev
        </button>

        <div className="pagerMid">Page {page + 1}</div>

        <button
          className="pagerBtn"
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasMore || loading}
          type="button"
        >
          Next
        </button>
      </div>

      {/* Debug helper (safe) */}
      <div className="debug">
        <div className="debugLine">
          <span className="k">Endpoint:</span>{" "}
          <span className="mono">/api/leaderboard/weekly</span>
        </div>
        <div className="debugLine">
          <span className="k">limit/offset:</span> {limit}/{offset}{" "}
          <span className="k">search:</span> {search || "—"}
        </div>
      </div>

      <style jsx>{`
        .wrap {
          max-width: 420px;
          margin: 0 auto;
          padding: 14px 14px 90px;
          background: #fff;
          color: #0f172a;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
        }

        .top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 6px 0 10px;
        }

        .title {
          font-size: 18px;
          font-weight: 900;
          letter-spacing: -0.2px;
        }
        .sub {
          font-size: 12px;
          color: #64748b;
          font-weight: 700;
          margin-top: 2px;
        }

        .homeBtn {
          border: 1px solid #1e4fff;
          color: #1e4fff;
          padding: 8px 10px;
          border-radius: 14px;
          font-size: 12px;
          font-weight: 900;
          text-decoration: none;
          white-space: nowrap;
        }

        .search {
          display: flex;
          gap: 8px;
          margin-top: 8px;
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
          border-color: #1e4fff;
          box-shadow: 0 0 0 3px rgba(30, 79, 255, 0.12);
        }
        .searchBtn {
          border: 1px solid #1e4fff;
          background: #1e4fff;
          color: white;
          font-weight: 900;
          padding: 10px 12px;
          border-radius: 14px;
          font-size: 13px;
        }

        .error {
          margin-top: 10px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #b91c1c;
          padding: 10px 12px;
          border-radius: 14px;
          font-size: 12px;
          font-weight: 700;
        }

        .card {
          margin-top: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          padding: 12px;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
        }

        .thead {
          display: grid;
          grid-template-columns: 36px 1fr 74px 74px 74px;
          gap: 8px;
          font-size: 11px;
          font-weight: 900;
          color: #64748b;
          padding: 0 4px 8px;
        }

        .trow {
          display: grid;
          grid-template-columns: 36px 1fr 74px 74px 74px;
          gap: 8px;
          align-items: center;
          padding: 10px 4px;
          border-top: 1px solid #e2e8f0;
          font-size: 13px;
        }

        .rank {
          font-weight: 900;
          color: #1e4fff;
        }

        .user {
          min-width: 0;
        }
        .userLink {
          font-weight: 900;
          color: #0f172a;
          text-decoration: none;
        }
        .userLink:active {
          opacity: 0.7;
        }

        .right {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .strong {
          font-weight: 900;
        }

        .muted {
          margin-top: 10px;
          font-size: 12px;
          color: #64748b;
          font-weight: 700;
        }
        .muted2 {
          margin-top: 6px;
          font-size: 11px;
          color: #94a3b8;
          font-weight: 700;
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        }

        .pager {
          margin-top: 12px;
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

        .debug {
          margin-top: 12px;
          border-top: 1px dashed #e2e8f0;
          padding-top: 10px;
          color: #64748b;
          font-size: 11px;
          font-weight: 700;
        }
        .debugLine {
          margin-top: 4px;
        }
        .k {
          color: #1e4fff;
          font-weight: 900;
        }
      `}</style>
    </div>
  );
}
