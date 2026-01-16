"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type IdentityResolveResponse = {
  identities: Array<{
    address: `0x${string}`;
    ensName: string | null;
    baseName: string | null;
    farcaster: {
      hasFarcaster: boolean;
      fid: number | null;
      username: string | null;
      displayName: string | null;
      pfpUrl: string | null;
      matchType: "address" | "username" | "none";
    };
    bestLabel: string;
    bestSubLabel: string;
  }>;
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
};

function nf(n: number) {
  return new Intl.NumberFormat("en-US").format(Number.isFinite(n) ? n : 0);
}
function usdc(n: number) {
  return `$${nf(n)}`;
}
function shortAddr(a: string) {
  return a?.startsWith("0x") && a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export default function UserProfilePage() {
  const router = useRouter();
  const params = useParams<{ address: string }>();

  const addressRaw = (params?.address ?? "").toLowerCase();
  const address = useMemo(() => addressRaw, [addressRaw]);

  const [identity, setIdentity] = useState<IdentityResolveResponse["identities"][number] | null>(null);
  const [weekly, setWeekly] = useState<WeeklyLbRow | null>(null);

  const [loading, setLoading] = useState({ identity: true, weekly: true });
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!address) return;

    (async () => {
      try {
        setLoading((s) => ({ ...s, identity: true }));
        const res = await fetch(`/api/identity/resolve?addresses=${encodeURIComponent(address)}`, { cache: "no-store" });
        const json: IdentityResolveResponse = await res.json();
        if (!res.ok) throw new Error((json as any)?.error ?? "Failed to load identity");
        setIdentity(json.identities?.[0] ?? null);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load identity");
      } finally {
        setLoading((s) => ({ ...s, identity: false }));
      }
    })();
  }, [address]);

  useEffect(() => {
    if (!address) return;

    (async () => {
      try {
        setLoading((s) => ({ ...s, weekly: true }));
        // weekly leaderboard API only includes people who earned THIS week.
        const res = await fetch(`/api/leaderboard/weekly?limit=1&offset=0&search=${encodeURIComponent(address)}`, {
          cache: "no-store",
        });
        const json: WeeklyLbResponse = await res.json();
        if (!res.ok) throw new Error((json as any)?.error ?? "Failed to load weekly rewards");
        setWeekly(json.rows?.[0] ?? null);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load weekly rewards");
      } finally {
        setLoading((s) => ({ ...s, weekly: false }));
      }
    })();
  }, [address]);

  const title = identity?.bestLabel ?? shortAddr(address);
  const subtitle = identity?.bestSubLabel ?? shortAddr(address);

  const pfp = identity?.farcaster?.pfpUrl ?? "";
  const hasFc = Boolean(identity?.farcaster?.hasFarcaster);
  const matchType = identity?.farcaster?.matchType ?? "none";

  return (
    <div className="wrap">
      <div className="topbar">
        <button className="back" onClick={() => router.back()} type="button">
          Back
        </button>
        <div className="topTitle">Profile</div>
        <div style={{ width: 44 }} />
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="card hero">
        <div className="avatar">
          {pfp ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pfp} alt="pfp" />
          ) : (
            <div className="avatarFallback">{(title?.[0] ?? "U").toUpperCase()}</div>
          )}
        </div>

        <div className="heroText">
          <div className="name">{loading.identity ? "Loading…" : title}</div>
          <div className="sub">{subtitle}</div>

          <div className="chips">
            {identity?.baseName ? <span className="chip">Basename: {identity.baseName}</span> : null}
            {identity?.ensName ? <span className="chip">ENS: {identity.ensName}</span> : null}
            {hasFc ? (
              <span className="chipBlue">
                Farcaster: {identity?.farcaster?.username ? `@${identity.farcaster.username}` : "linked"} (
                {matchType})
              </span>
            ) : (
              <span className="chip">Farcaster: not linked</span>
            )}
          </div>
        </div>
      </div>

      {/* Reward summary */}
      <div className="section">
        <div className="sectionHeader">
          <div className="sectionTitle">Rewards</div>
          <div className="sectionMeta">USDC</div>
        </div>

        <div className="grid">
          <div className="miniCard">
            <div className="label">This week</div>
            <div className="value">{loading.weekly ? "…" : usdc(weekly?.thisWeekReward ?? 0)}</div>
          </div>
          <div className="miniCard">
            <div className="label">Prev week</div>
            <div className="value">{loading.weekly ? "…" : usdc(weekly?.previousWeekReward ?? 0)}</div>
          </div>
          <div className="miniCard">
            <div className="label">All-time</div>
            <div className="value">{loading.weekly ? "…" : usdc(weekly?.allTimeReward ?? 0)}</div>
          </div>
          <div className="miniCard">
            <div className="label">This week rank</div>
            <div className="value">{loading.weekly ? "…" : weekly?.rank ? `#${weekly.rank}` : "—"}</div>
          </div>
        </div>

        {!loading.weekly && !weekly ? (
          <div className="note">
            This address does not appear in the current-week reward list. (It may have earned in earlier weeks. We will
            add full history next.)
          </div>
        ) : null}
      </div>

      {/* Social activity (only when we can resolve Farcaster) */}
      <div className="section">
        <div className="sectionHeader">
          <div className="sectionTitle">Social activity</div>
          <div className="sectionMeta">This week</div>
        </div>

        {hasFc ? (
          <div className="note">
            Social stats will be pulled via Neynar using the user’s Farcaster identity. (Next step: casts/likes/replies/recasts + top posts.)
          </div>
        ) : (
          <div className="note">
            Social stats are unavailable because this wallet is not linked to a Farcaster account. If the owner verifies this
            address on Farcaster, the profile can show PFP + activity automatically.
          </div>
        )}
      </div>

      <div className="foot">Royal blue + white | Mobile-first</div>

      <style jsx>{`
        .wrap {
          max-width: 420px;
          margin: 0 auto;
          padding: 14px;
          background: #ffffff;
          color: #0f172a;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
        }

        .topbar {
          position: sticky;
          top: 0;
          z-index: 10;
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(8px);
          border-bottom: 1px solid #e2e8f0;
          padding: 10px 0 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .back {
          border: 1px solid #1d4ed8;
          background: #ffffff;
          color: #1d4ed8;
          font-weight: 900;
          border-radius: 12px;
          padding: 8px 10px;
          font-size: 12px;
        }
        .topTitle {
          font-weight: 900;
          font-size: 14px;
          color: #0f172a;
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

        .card {
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          padding: 12px;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
          background: #fff;
        }

        .hero {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-top: 12px;
        }

        .avatar {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          flex: 0 0 auto;
        }
        .avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .avatarFallback {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #1d4ed8;
          color: #fff;
          font-weight: 900;
          font-size: 18px;
        }

        .heroText {
          flex: 1;
          min-width: 0;
        }
        .name {
          font-weight: 900;
          font-size: 16px;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sub {
          font-size: 12px;
          color: #64748b;
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chips {
          margin-top: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .chip {
          font-size: 11px;
          border: 1px solid #e2e8f0;
          padding: 6px 10px;
          border-radius: 999px;
          color: #0f172a;
          background: #fff;
          font-weight: 800;
        }
        .chipBlue {
          font-size: 11px;
          border: 1px solid #dbeafe;
          padding: 6px 10px;
          border-radius: 999px;
          color: #1d4ed8;
          background: #eff6ff;
          font-weight: 900;
        }

        .section {
          margin-top: 14px;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          padding: 12px;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
          background: #fff;
        }
        .sectionHeader {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
        }
        .sectionTitle {
          font-size: 14px;
          font-weight: 900;
        }
        .sectionMeta {
          font-size: 12px;
          font-weight: 900;
          color: #1d4ed8;
          white-space: nowrap;
        }

        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 10px;
        }
        .miniCard {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 12px;
          background: #ffffff;
        }
        .label {
          font-size: 11px;
          color: #64748b;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }
        .value {
          margin-top: 8px;
          font-size: 18px;
          font-weight: 900;
          color: #0f172a;
        }

        .note {
          margin-top: 10px;
          font-size: 12px;
          color: #475569;
          font-weight: 700;
          line-height: 1.35;
        }

        .foot {
          margin: 14px 0 6px;
          text-align: center;
          font-size: 11px;
          color: #64748b;
          font-weight: 800;
        }
      `}</style>
    </div>
  );
}
