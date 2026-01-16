"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";

type RewardsSummary = {
  address: string;
  allTimeUsdc: number;
  totalWeeksEarned: number;
  latestWeek: { weekNumber: number; usdc: number } | null;
  history: Array<{ weekNumber: number; weekStartDate: string; usdc: number }>;
};

type AddressRewardsResponse = {
  summary: RewardsSummary;
  meta: { updatedAt: string; source: string };
  error?: string;
};

type SocialResponse = {
  user: {
    fid: number;
    username: string | null;
    displayName: string | null;
    pfpUrl: string | null;
    followerCount: number;
    followingCount: number;
  };
  thisWeek: {
    weekStartISO: string;
    weekEndISO: string;
    casts: number;
    repliesAuthored: number;
    likesReceived: number;
    recastsReceived: number;
  };
  topCasts: Array<{
    hash: string | null;
    text: string;
    timestamp: string | null;
    likes: number;
    recasts: number;
    score: number;
  }>;
  meta: { updatedAt: string; source: string };
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

function safeLower(s: string) {
  return (s || "").trim().toLowerCase();
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function shortText(s: string, n = 110) {
  const t = (s || "").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + "…";
}

export default function ProfileView({
  address,
  mode,
  viewerFid,
}: {
  address: string | null;
  mode: "viewer" | "address";
  viewerFid?: number | null;
}) {
  const addr = useMemo(() => {
    const a = safeLower(address || "");
    return a.startsWith("0x") && a.length === 42 ? a : null;
  }, [address]);

  const [rewards, setRewards] = useState<AddressRewardsResponse | null>(null);
  const [rewardsErr, setRewardsErr] = useState<string>("");

  const [copyOk, setCopyOk] = useState<"idle" | "ok" | "fail">("idle");

  // social only for viewer mode (because we only have FID for the viewer, not for random wallet)
  const [social, setSocial] = useState<SocialResponse | null>(null);
  const [socialErr, setSocialErr] = useState<string>("");

  // Load rewards
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setRewardsErr("");
        setRewards(null);

        if (!addr) {
          setRewardsErr("No valid wallet address.");
          return;
        }

        const res = await fetch(`/api/address/${addr}`, { cache: "no-store" });
        const json = (await res.json()) as AddressRewardsResponse;
        if (!res.ok) throw new Error(json?.error || "Failed to load rewards");
        if (!cancelled) setRewards(json);
      } catch (e) {
        if (!cancelled) setRewardsErr(e instanceof Error ? e.message : "Unknown error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [addr]);

  // Load social (viewer only)
  useEffect(() => {
    if (mode !== "viewer") return;
    if (!viewerFid) return;

    let cancelled = false;
    (async () => {
      try {
        setSocialErr("");
        setSocial(null);

        const res = await fetch(`/api/me?fid=${viewerFid}`, { cache: "no-store" });
        const json = (await res.json()) as SocialResponse;
        if (!res.ok) throw new Error(json?.error || "Failed to load social");
        if (!cancelled) setSocial(json);
      } catch (e) {
        if (!cancelled) setSocialErr(e instanceof Error ? e.message : "Unknown error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, viewerFid]);

  const summary = rewards?.summary;

  async function onCopy() {
    if (!addr) return;
    const ok = await copyText(addr);
    setCopyOk(ok ? "ok" : "fail");
    setTimeout(() => setCopyOk("idle"), 1500);
  }

  return (
    <div className="wrap">
      {/* Header card */}
      <div className="headerCard">
        <div className="row">
          <div className="avatarBox">
            <Image
              src="/logo-mark.png"
              alt="Logo"
              width={44}
              height={44}
              style={{ borderRadius: 16 }}
            />
          </div>

          <div className="grow">
            <div className="h1">{mode === "viewer" ? "Profile" : "User profile"}</div>
            <div className="addrLine">
              <span className="mono">{addr ? shortAddr(addr) : "—"}</span>
              <button className="copyBtn" type="button" onClick={onCopy} disabled={!addr}>
                {copyOk === "ok" ? "Copied" : copyOk === "fail" ? "Copy failed" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Rewards */}
      <div className="card">
        <div className="cardTop">
          <div className="cardTitle">Reward summary</div>
          <div className="metaText">{rewards?.meta?.updatedAt ? "Updated" : ""}</div>
        </div>

        {rewardsErr ? <div className="error">{rewardsErr}</div> : null}

        {!summary ? (
          <div className="muted">Loading rewards…</div>
        ) : (
          <>
            <div className="kpis">
              <div className="kpi">
                <div className="kpiLabel">All-time earned</div>
                <div className="kpiValue">{usdc(summary.allTimeUsdc)}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">Weeks earned</div>
                <div className="kpiValue">{nf(summary.totalWeeksEarned)}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">Latest week</div>
                <div className="kpiValue">{summary.latestWeek ? `Week ${summary.latestWeek.weekNumber}` : "—"}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">Latest week USDC</div>
                <div className="kpiValue">{usdc(summary.latestWeek?.usdc ?? 0)}</div>
              </div>
            </div>

            <div className="historyTitle">Reward history</div>
            <div className="historyHint">Newest first</div>

            <div className="historyTable">
              <div className="hRow hHead">
                <div>Week</div>
                <div>Date</div>
                <div className="right">USDC</div>
              </div>

              {summary.history.length === 0 ? (
                <div className="muted">No reward history found.</div>
              ) : (
                summary.history.slice(0, 40).map((w) => (
                  <div key={w.weekNumber} className="hRow">
                    <div className="strong">#{w.weekNumber}</div>
                    <div className="mono">{w.weekStartDate}</div>
                    <div className="right strong">{usdc(w.usdc)}</div>
                  </div>
                ))
              )}
            </div>

            {summary.history.length > 40 ? (
              <div className="muted">Showing latest 40 weeks for performance.</div>
            ) : null}
          </>
        )}
      </div>

      {/* Social (viewer only) */}
      <div className="card">
        <div className="cardTop">
          <div className="cardTitle">Social activity</div>
          <div className="metaText">After rewards</div>
        </div>

        {mode !== "viewer" ? (
          <div className="muted">
            Social data is only available for your own Profile when your wallet is linked to a Farcaster FID.
          </div>
        ) : !viewerFid ? (
          <div className="muted">
            No Mini App viewer context yet. Open inside Farcaster/Base Mini App so we can read your FID.
          </div>
        ) : socialErr ? (
          <div className="error">{socialErr}</div>
        ) : !social ? (
          <div className="muted">Loading social…</div>
        ) : (
          <>
            <div className="socialHead">
              <div className="pfp">
                {social.user?.pfpUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={social.user.pfpUrl} alt="" />
                ) : null}
              </div>
              <div className="grow">
                <div className="strong">
                  {social.user.displayName || social.user.username || `FID ${social.user.fid}`}
                </div>
                <div className="mutedSmall">
                  {social.user.username ? `@${social.user.username}` : `FID ${social.user.fid}`}
                </div>
              </div>
            </div>

            <div className="kpis2">
              <div className="kpi2">
                <div className="kpiLabel">Casts</div>
                <div className="kpiValue">{nf(social.thisWeek.casts)}</div>
              </div>
              <div className="kpi2">
                <div className="kpiLabel">Replies</div>
                <div className="kpiValue">{nf(social.thisWeek.repliesAuthored)}</div>
              </div>
              <div className="kpi2">
                <div className="kpiLabel">Likes</div>
                <div className="kpiValue">{nf(social.thisWeek.likesReceived)}</div>
              </div>
              <div className="kpi2">
                <div className="kpiLabel">Recasts</div>
                <div className="kpiValue">{nf(social.thisWeek.recastsReceived)}</div>
              </div>
            </div>

            <div className="historyTitle">Top casts</div>
            <div className="castList">
              {(social.topCasts ?? []).slice(0, 5).map((c, idx) => (
                <div key={idx} className="cast">
                  <div className="castText">{shortText(c.text)}</div>
                  <div className="castMeta">
                    <span>♥ {nf(c.likes)}</span>
                    <span>↻ {nf(c.recasts)}</span>
                  </div>
                </div>
              ))}
              {(social.topCasts ?? []).length === 0 ? (
                <div className="muted">No casts found for this week window.</div>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* Support creator + hidden creator links */}
      <div className="card">
        <div className="cardTop">
          <div className="cardTitle">Support creator</div>
          <div className="metaText">Optional</div>
        </div>

        <div className="mutedSmall">
          If this dashboard helps you, you can tip the creator.
        </div>

        <div className="tipBox">
          <div className="mono strong">0xd4a1D777e2882487d47c96bc23A47CeaB4f4f18A</div>
          <button className="copyBtn2" type="button" onClick={() => copyText("0xd4a1D777e2882487d47c96bc23A47CeaB4f4f18A")}>
            Copy tip address
          </button>
        </div>

        {/* Hidden-ish creator links: small + low opacity */}
        <div className="creator">
          <a href="https://x.com/akbarX402" target="_blank" rel="noreferrer">
            Created by Akbar
          </a>
          <span className="dot">•</span>
          <a href="https://base.app/profile/akbaronchain" target="_blank" rel="noreferrer">
            Base profile
          </a>
        </div>
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

        .headerCard,
        .card {
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          padding: 14px;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
          background: #fff;
        }

        .card {
          margin-top: 12px;
        }

        .row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .avatarBox {
          width: 44px;
          height: 44px;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid #e2e8f0;
          background: #fff;
          display: grid;
          place-items: center;
        }

        .grow {
          flex: 1;
          min-width: 0;
        }

        .h1 {
          font-size: 18px;
          font-weight: 900;
          letter-spacing: -0.2px;
        }

        .addrLine {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 6px;
        }

        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
            "Courier New", monospace;
        }

        .copyBtn {
          border: 1px solid #1e4fff;
          background: #1e4fff;
          color: #fff;
          font-weight: 900;
          padding: 6px 10px;
          border-radius: 12px;
          font-size: 12px;
          white-space: nowrap;
        }
        .copyBtn:disabled {
          opacity: 0.5;
        }

        .cardTop {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
        }
        .cardTitle {
          font-size: 14px;
          font-weight: 900;
        }
        .metaText {
          font-size: 12px;
          color: #64748b;
          font-weight: 800;
        }

        .kpis {
          margin-top: 12px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .kpi {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 10px;
        }
        .kpiLabel {
          font-size: 11px;
          color: #64748b;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .kpiValue {
          margin-top: 6px;
          font-size: 16px;
          font-weight: 900;
        }

        .historyTitle {
          margin-top: 12px;
          font-size: 13px;
          font-weight: 900;
        }
        .historyHint {
          margin-top: 2px;
          font-size: 12px;
          color: #64748b;
          font-weight: 800;
        }

        .historyTable {
          margin-top: 10px;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          overflow: hidden;
        }
        .hRow {
          display: grid;
          grid-template-columns: 70px 1fr 90px;
          gap: 8px;
          padding: 10px 12px;
          border-top: 1px solid #e2e8f0;
          font-size: 12px;
          font-weight: 800;
        }
        .hHead {
          border-top: none;
          background: #f8fafc;
          color: #64748b;
          font-weight: 900;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .right {
          text-align: right;
        }
        .strong {
          font-weight: 900;
        }

        .muted {
          margin-top: 10px;
          font-size: 12px;
          color: #64748b;
          font-weight: 800;
        }
        .mutedSmall {
          margin-top: 8px;
          font-size: 12px;
          color: #64748b;
          font-weight: 800;
        }

        .error {
          margin-top: 10px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #b91c1c;
          padding: 10px 12px;
          border-radius: 14px;
          font-size: 12px;
          font-weight: 800;
        }

        .socialHead {
          margin-top: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .pfp {
          width: 44px;
          height: 44px;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid #e2e8f0;
          background: #fff;
        }
        .pfp img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .kpis2 {
          margin-top: 10px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .kpi2 {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 10px;
        }

        .castList {
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .cast {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 10px 12px;
        }
        .castText {
          font-size: 12px;
          font-weight: 800;
        }
        .castMeta {
          margin-top: 8px;
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: #64748b;
          font-weight: 900;
        }

        .tipBox {
          margin-top: 10px;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .copyBtn2 {
          border: 1px solid #1e4fff;
          background: #fff;
          color: #1e4fff;
          font-weight: 900;
          padding: 10px 12px;
          border-radius: 14px;
          font-size: 13px;
        }

        .creator {
          margin-top: 12px;
          text-align: center;
          font-size: 12px;
          font-weight: 800;
          opacity: 0.55;
        }
        .creator a {
          color: #0f172a;
          text-decoration: none;
        }
        .dot {
          margin: 0 8px;
          opacity: 0.6;
        }
      `}</style>
    </div>
  );
}
