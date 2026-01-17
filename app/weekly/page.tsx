"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ConnectWallet, Wallet } from "@coinbase/onchainkit/wallet";
import { Avatar, Name } from "@coinbase/onchainkit/identity";
import { Connected } from "@coinbase/onchainkit";

type OverviewResponse = {
  allTime: { totalUsdcDistributed: number; totalUniqueUsers: number };
  latestWeek: {
    weekNumber: number;
    weekStartDate: string | null;
    totalUsdcDistributed: number;
    uniqueUsers: number;
  };
  meta: { updatedAt: string; source: string; startBlock: number; latestBlock: number };
};

type BreakdownResponse = {
  items: { rewardAmount: number; userCount: number }[];
  totals: { rewardedUsers: number };
  meta: { updatedAt: string; source: string };
};

type WeeklyLbRow = {
  rank: number;
  user_address: string;
  this_week_reward: number;
  previous_week_reward: number;
  all_time_reward: number;
};

type WeeklyLbResponse = {
  rows: WeeklyLbRow[];
  meta: { updatedAt: string; source: string; weekNumber: number };
};

function nf(n: number) {
  return new Intl.NumberFormat("en-US").format(Number.isFinite(n) ? n : 0);
}
function usdc(n: number) {
  return `$${nf(Number.isFinite(n) ? n : 0)}`;
}
function shortAddr(a: string) {
  if (!a?.startsWith("0x") || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function isAddr(s: string) {
  const a = (s || "").trim().toLowerCase();
  return a.startsWith("0x") && a.length === 42;
}

function NavButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={`navBtn ${active ? "navBtnActive" : ""}`}>
      {label}
    </button>
  );
}

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownResponse | null>(null);
  const [weekly, setWeekly] = useState<WeeklyLbResponse | null>(null);

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

  // overview
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

  // breakdown
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

  // weekly leaderboard (paged + search)
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

        const res = await fetch(`/api/leaderboard/weekly?${qs.toString()}`, { cache: "no-store" });
        const json = (await res.json()) as { rows: WeeklyLbRow[]; meta: any; error?: string };

        if (!res.ok) throw new Error(json?.error ?? "Failed to load weekly leaderboard");

        // normalize to WeeklyLbResponse
        const normalized: WeeklyLbResponse = {
          rows: (json.rows ?? []).map((r) => ({
            rank: Number(r.rank ?? 0),
            user_address: String((r as any).user_address ?? ""),
            this_week_reward: Number((r as any).this_week_reward ?? 0),
            previous_week_reward: Number((r as any).previous_week_reward ?? 0),
            all_time_reward: Number((r as any).all_time_reward ?? 0),
          })),
          meta: {
            updatedAt: String(json?.meta?.updatedAt ?? new Date().toISOString()),
            source: String(json?.meta?.source ?? "base-rpc"),
            weekNumber: Number(json?.meta?.weekNumber ?? overview?.latestWeek?.weekNumber ?? 0),
          },
        };

        if (!cancelled) setWeekly(normalized);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load leaderboard");
      } finally {
        if (!cancelled) setLoading((s) => ({ ...s, weekly: false }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [offset, search, limit, overview?.latestWeek?.weekNumber]);

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
    setSearch(search.trim().toLowerCase());
  }

  const weekLabel = overview?.latestWeek?.weekNumber
    ? `Week ${overview.latestWeek.weekNumber}`
    : "Latest week";

  const hasMore = Boolean((weekly as any)?.meta?.hasMore); // if your API provides it later

  const tipAddress = "0xd4a1D777e2882487d47c96bc23A47CeaB4f4f18A";

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  return (
    <div className="wrap">
      <div className="header">
        <div className="leftHead">
          <div className="brand">
            <div className="logo">
              <Image src="/logo.png" alt="Logo" width={28} height={28} style={{ borderRadius: 8 }} />
            </div>
            <div>
              <div className="title">Baseapp Reward Dashboard</div>
              <div className="subtitle">Weekly rewards, all-time history</div>
            </div>
          </div>
        </div>

        <div className="rightHead">
          <div className="weekPill">{weekLabel}</div>

          <div className="identityPill">
            <Connected
              connecting={<div className="miniText">Connecting…</div>}
              fallback={
                <Wallet>
                  <ConnectWallet className="connectBtn">Connect</ConnectWallet>
                </Wallet>
              }
            >
              <Wallet>
                <ConnectWallet className="connectedBtn">
                  <Avatar className="ocAvatar" />
                  <Name className="ocName" />
                </ConnectWallet>
              </Wallet>
            </Connected>
          </div>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {/* KPI Cards */}
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
              <div className="breakLeft">
                <span className="badge">{usdc(it.rewardAmount)}</span>
              </div>
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

        <form className="search" onSubmit={onSearchSubmit}>
          <input
            className="searchInput"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
            (weekly?.rows ?? []).map((r) => {
              const addr = (r.user_address || "").toLowerCase();
              return (
                <button
                  type="button"
                  className="trow trowBtn"
                  key={`${r.rank}-${addr}`}
                  onClick={() => {
                    if (isAddr(addr)) router.push(`/find/${addr}`);
                  }}
                >
                  <div className="rank">{r.rank}</div>
                  <div className="user">{shortAddr(addr)}</div>
                  <div className="right strong">{usdc(r.this_week_reward)}</div>
                </button>
              );
            })
          )}

          {!loading.weekly && (weekly?.rows?.length ?? 0) === 0 ? (
            <div className="muted">No results.</div>
          ) : null}

          <div className="hint">Click any user address to visit profile</div>
        </div>

        <div className="pager">
          <button
            className="pagerBtn"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            type="button"
          >
            Prev
          </button>

          <div className="pagerMid">Page {page + 1}</div>

          <button
            className="pagerBtn"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore}
            type="button"
          >
            Next
          </button>
        </div>
      </div>

      {/* Support + Created by (subtle) */}
      <div className="section">
        <div className="sectionHeader">
          <div className="sectionTitle">Support the creator</div>
          <div className="sectionMeta">Optional</div>
        </div>

        <div className="tipBox">
          <div className="tipAddr">{tipAddress}</div>
          <div className="tipActions">
            <button className="tipBtn" type="button" onClick={() => copyText(tipAddress)}>
              Copy address
            </button>
          </div>

          <div className="createdBy">
            <details>
              <summary>Created by Akbar</summary>
              <div className="createdLinks">
                <a href="https://x.com/akbarX402" target="_blank" rel="noreferrer">
                  X
                </a>
                <a href="https://base.app/profile/akbaronchain" target="_blank" rel="noreferrer">
                  Base profile
                </a>
              </div>
            </details>
          </div>
        </div>
      </div>

      {/* Bottom Navigation Bar */}
      <div className="bottomNav">
        <NavButton active={pathname === "/"} label="Home" onClick={() => router.push("/")} />
        <NavButton active={pathname === "/weekly"} label="Weekly" onClick={() => router.push("/weekly")} />
        <NavButton active={pathname === "/all-time"} label="All-time" onClick={() => router.push("/all-time")} />
        <NavButton active={pathname === "/profile"} label="Profile" onClick={() => router.push("/profile")} />
        <NavButton active={pathname === "/find"} label="Find" onClick={() => router.push("/find")} />
      </div>

      <style jsx>{`
        .wrap {
          max-width: 420px;
          margin: 0 auto;
          padding: 14px;
          padding-bottom: 100px;
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
        }

        .logo {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid #e2e8f0;
          background: #fff;
        }

        .title {
          font-size: 16px;
          font-weight: 900;
          letter-spacing: -0.2px;
          line-height: 1.1;
        }
        .subtitle {
          font-size: 12px;
          color: #64748b;
          margin-top: 2px;
          font-weight: 700;
        }

        .rightHead {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .weekPill {
          background: #1d4ed8;
          color: white;
          padding: 8px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
        }

        .miniText {
          font-size: 12px;
          color: #64748b;
          font-weight: 700;
        }

        :global(.connectBtn) {
          border: 1px solid #1d4ed8;
          background: #ffffff;
          color: #1d4ed8;
          font-weight: 900;
          padding: 8px 10px;
          border-radius: 999px;
          font-size: 12px;
        }

        :global(.connectedBtn) {
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #0f172a;
          font-weight: 900;
          padding: 6px 8px;
          border-radius: 999px;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        :global(.ocAvatar) {
          width: 22px !important;
          height: 22px !important;
          border-radius: 999px !important;
        }

        :global(.ocName) {
          font-weight: 900 !important;
          font-size: 12px !important;
          max-width: 92px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
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
          font-size: 22px;
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
          grid-template-columns: 42px 1fr 100px;
          gap: 8px;
          font-size: 11px;
          font-weight: 900;
          color: #64748b;
          padding: 0 6px 8px;
        }

        .trow {
          width: 100%;
          display: grid;
          grid-template-columns: 42px 1fr 100px;
          gap: 8px;
          align-items: center;
          padding: 10px 6px;
          border-top: 1px solid #e2e8f0;
          font-size: 13px;
          background: transparent;
          border-left: none;
          border-right: none;
          border-bottom: none;
          text-align: left;
        }

        .trowBtn {
          cursor: pointer;
        }
        .trowBtn:active {
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

        .hint {
          margin-top: 10px;
          font-size: 12px;
          color: #64748b;
          font-weight: 800;
          text-align: center;
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

        .tipBox {
          margin-top: 10px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 12px;
          background: #ffffff;
        }
        .tipAddr {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          font-size: 12px;
          font-weight: 900;
          color: #0f172a;
          word-break: break-all;
        }
        .tipActions {
          margin-top: 10px;
          display: flex;
          gap: 8px;
        }
        .tipBtn {
          border: 1px solid #1d4ed8;
          background: #1d4ed8;
          color: #fff;
          font-weight: 900;
          padding: 10px 12px;
          border-radius: 14px;
          font-size: 12px;
        }

        .createdBy {
          margin-top: 10px;
          font-size: 12px;
          color: #64748b;
          font-weight: 800;
        }
        .createdLinks {
          margin-top: 8px;
          display: flex;
          gap: 12px;
        }
        .createdLinks a {
          color: #1d4ed8;
          font-weight: 900;
          text-decoration: none;
        }

        .bottomNav {
          position: fixed;
          left: 50%;
          transform: translateX(-50%);
          bottom: 10px;
          width: min(420px, calc(100vw - 24px));
          background: #1d4ed8;
          border-radius: 18px;
          padding: 10px;
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
          box-shadow: 0 10px 30px rgba(2, 6, 23, 0.18);
          z-index: 50;
        }

        .navBtn {
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          font-weight: 900;
          padding: 10px 10px;
          border-radius: 14px;
          font-size: 12px;
          letter-spacing: 0.2px;
        }

        .navBtnActive {
          background: #ffffff;
          color: #1d4ed8;
          border-color: #ffffff;
        }
      `}</style>
    </div>
  );
}
