"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";

type Row = Record<string, unknown>;

type AllTimeApiResponse = {
  rows: Row[];
  meta: { queryId: number; source: string; updatedAt: string };
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

function getWeekNumber(k: string) {
  const m = /^week_(\d+)$/.exec(k);
  return m ? Number(m[1]) : null;
}

export default function AllTimePage() {
  const [rawRows, setRawRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(0);
  const limit = 10;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        // ✅ Your existing API route
        const res = await fetch("/api/dune/all-time", { cache: "no-store" });
        const json = (await res.json()) as AllTimeApiResponse;

        if (!res.ok) throw new Error(json?.error ?? "Failed to load all-time data");
        if (!cancelled) setRawRows(json.rows ?? []);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
    setSearch(searchInput.trim().toLowerCase());
  }

  const columns = useMemo(() => {
    const s = new Set<string>();
    for (const r of rawRows) Object.keys(r || {}).forEach((k) => s.add(k));

    const baseCols = ["all_time_rank", "user_address", "total_usdc_earned", "total_weeks_earned"];

    const weekCols = Array.from(s)
      .filter((k) => /^week_\d+$/.test(k))
      .sort((a, b) => (getWeekNumber(b) ?? 0) - (getWeekNumber(a) ?? 0)); // newest -> oldest

    const otherCols = Array.from(s).filter(
      (k) => !baseCols.includes(k) && !/^week_\d+$/.test(k)
    );

    // Dune-style order: base, then weeks (newest->oldest), then any other columns
    return [...baseCols, ...weekCols, ...otherCols];
  }, [rawRows]);

  const filteredRows = useMemo(() => {
    if (!search) return rawRows;

    const q = search;
    return rawRows.filter((r) => {
      const addr = String(r?.user_address ?? "").toLowerCase();
      return addr.includes(q);
    });
  }, [rawRows, search]);

  const total = filteredRows.length;
  const hasMore = (page + 1) * limit < total;

  const pageRows = useMemo(() => {
    const start = page * limit;
    return filteredRows.slice(start, start + limit);
  }, [filteredRows, page]);

  const stickyCols = ["all_time_rank", "user_address"];

  return (
    <div className="wrap">
      <div className="top">
        <div>
          <div className="title">All-time leaderboard</div>
          <div className="sub">Dune-style table • auto supports new weeks</div>
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
        ) : total === 0 ? (
          <div className="muted">No rows returned.</div>
        ) : (
          <div className="table" role="table" aria-label="All-time leaderboard">
            {/* Header */}
            <div className="row head">
              {columns.map((k) => (
                <div
                  key={k}
                  className={`cell headCell ${stickyCols.includes(k) ? "sticky" : ""} ${
                    k === "user_address" ? "sticky2" : ""
                  }`}
                  data-col={k}
                >
                  {prettyHeader(k)}
                </div>
              ))}
            </div>

            {/* Rows */}
            {pageRows.map((r, i) => (
              <div className="row" key={`${String(r.user_address ?? i)}-${i}`}>
                {columns.map((k) => {
                  const raw = r[k];
                  const isUser = k === "user_address";
                  const address = isUser ? String(raw ?? "") : "";

                  return (
                    <div
                      key={k}
                      className={`cell ${stickyCols.includes(k) ? "sticky" : ""} ${
                        k === "user_address" ? "sticky2" : ""
                      }`}
                      data-col={k}
                    >
                      {isUser && address.startsWith("0x") ? (
                        <Link className="userLink" href={`/user/${address}`}>
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
          Page {page + 1} · {nf(total)} users
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
          padding: 14px 14px 14px;
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
          grid-auto-columns: minmax(110px, 1fr);
          gap: 0;
          border-top: 1px solid #e2e8f0;
          background: #fff;
        }

        .row.head {
          border-top: none;
          position: sticky;
          top: 0;
          z-index: 5;
          background: #fff;
        }

        .cell {
          padding: 10px 10px;
          font-size: 12px;
          font-weight: 700;
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

        /* Sticky first columns */
        .sticky {
          position: sticky;
          left: 0;
          background: #fff;
          z-index: 3;
          box-shadow: 6px 0 10px rgba(15, 23, 42, 0.04);
        }
        .sticky2 {
          left: 110px; /* width of first column */
          z-index: 4;
        }

        /* column widths */
        .cell[data-col="all_time_rank"] {
          min-width: 110px;
        }
        .cell[data-col="user_address"] {
          min-width: 170px;
        }
        .cell[data-col="total_usdc_earned"] {
          min-width: 130px;
        }
        .cell[data-col="total_weeks_earned"] {
          min-width: 110px;
        }

        .userLink {
          color: #0f172a;
          text-decoration: none;
          font-weight: 900;
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
