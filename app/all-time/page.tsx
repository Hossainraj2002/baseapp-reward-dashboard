"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";

type Row = Record<string, unknown>;

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
  if (k === "total_usdc_earned") return "All-time";
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

        const res = await fetch(`/api/leaderboard/alltime?${qs.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as AllTimeResponse;

        if (!res.ok) throw new Error(json?.error || "Failed to load all-time leaderboard");
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

  const columns = data?.columns ?? [];
  const rows = data?.rows ?? [];
  const hasMore = Boolean(data?.meta?.hasMore);

  // Sticky: Rank + User + All-time always visible
  const stickyCols = ["all_time_rank", "user_address", "total_usdc_earned"];

  // Sticky left offsets must match these widths:
  const W_RANK = 64;
  const W_USER = 140;
  const W_TOTAL = 120;

  return (
    <div className="wrap">
      <div className="top">
        <div>
          <div className="title">All-time leaderboard</div>
          <div className="sub">Ranked by total USDC earned</div>
        </div>

        <Link className="homeBtn" href="/">
          Home
        </Link>
      </div>

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

      {err ? <div className="error">{err}</div> : null}

      <div className="tableWrap">
        {loading ? (
          <div className="muted">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="muted">No rows returned.</div>
        ) : (
          <div className="table" role="table" aria-label="All-time leaderboard">
            <div className="row head">
              {columns.map((k) => (
                <div
                  key={k}
                  className={[
                    "cell",
                    "headCell",
                    stickyCols.includes(k) ? "sticky" : "",
                    k === "user_address" ? "stickyUser" : "",
                    k === "total_usdc_earned" ? "stickyTotal" : "",
                  ].join(" ")}
                  data-col={k}
                >
                  {prettyHeader(k)}
                </div>
              ))}
            </div>

            {rows.map((r, i) => (
              <div className="row" key={`${String(r.user_address ?? i)}-${i}`}>
                {columns.map((k) => {
                  const raw = r[k];
                  const isUser = k === "user_address";
                  const address = isUser ? String(raw ?? "") : "";

                  return (
                    <div
                      key={k}
                      className={[
                        "cell",
                        stickyCols.includes(k) ? "sticky" : "",
                        k === "user_address" ? "stickyUser" : "",
                        k === "total_usdc_earned" ? "stickyTotal" : "",
                      ].join(" ")}
                      data-col={k}
                    >
                      {isUser && address.startsWith("0x") ? (
                        <Link className="userLink" href={`/find/${address}`}>
                          {shortAddr(address)}
                        </Link>
                      ) : (
                        <span>{formatCell(k, raw)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="hint">Click any user address to visit profile.</div>

      <div className="pager">
        <button
          className="pagerBtn"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0 || loading}
          type="button"
        >
          Prev
        </button>

        <div className="pagerMid">
          Page {page + 1} · {nf(data?.meta?.total ?? 0)} users
        </div>

        <button
          className="pagerBtn"
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasMore || loading}
          type="button"
        >
          Next
        </button>
      </div>

      <style jsx>{`
        .wrap {
          max-width: 430px;
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

        .tableWrap {
          margin-top: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          padding: 10px;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
          overflow: hidden;
        }

        .muted {
          font-size: 12px;
          color: #64748b;
          font-weight: 700;
        }

        .table {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 14px;
        }

        .row {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: minmax(92px, 1fr);
          border-top: 1px solid #e2e8f0;
          background: #fff;
        }

        .row.head {
          border-top: none;
          position: sticky;
          top: 0;
          z-index: 6;
          background: #fff;
        }

        .cell {
          padding: 10px 10px;
          font-size: 12px;
          font-weight: 800;
          border-right: 1px solid #eef2f7;
          white-space: nowrap;
        }

        .headCell {
          font-size: 11px;
          font-weight: 900;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Sticky group (Rank + User + Total) */
        .sticky {
          position: sticky;
          background: #fff;
          z-index: 4;
          box-shadow: 6px 0 10px rgba(15, 23, 42, 0.04);
        }

        .cell[data-col="all_time_rank"] {
          min-width: ${W_RANK}px;
        }
        .cell[data-col="user_address"] {
          min-width: ${W_USER}px;
        }
        .cell[data-col="total_usdc_earned"] {
          min-width: ${W_TOTAL}px;
        }

        .cell[data-col="all_time_rank"].sticky {
          left: 0px;
          z-index: 5;
        }
        .stickyUser {
          left: ${W_RANK}px;
          z-index: 5;
        }
        .stickyTotal {
          left: ${W_RANK + W_USER}px;
          z-index: 5;
        }

        .userLink {
          color: #0f172a;
          text-decoration: none;
          font-weight: 900;
        }

        .hint {
          margin-top: 10px;
          text-align: center;
          font-size: 12px;
          color: #64748b;
          font-weight: 800;
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
          text-align: center;
        }
      `}</style>
    </div>
  );
}
