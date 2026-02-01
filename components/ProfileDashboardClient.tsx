"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useAccount, useSendTransaction, useSwitchChain, useWriteContract } from "wagmi";
import { base } from "viem/chains";
import { erc20Abi, parseEther, parseUnits } from "viem";
import CopyButton from "@/components/CopyButton"; // still used in Support section only

type FarcasterUser = {
  fid: number;
  username: string;
  display_name: string;
  pfp_url: string;
  follower_count: number;
  following_count: number;
  score: number;
  bio?: string;
};

type RewardSummary = {
  all_time_usdc: number;
  earning_weeks: number;
  latest_week_label: string;
  latest_week_usdc: number;
  prev_week_label: string;
  prev_week_usdc: number;
  latest_week_start_utc: string; // ISO string (UTC)
};

type RewardHistory = {
  week_number: number;
  week_label: string;
  week_start_utc: string;
  usdc: number;
};

type ProfilePayload = {
  address: `0x${string}`;
  farcaster_user: FarcasterUser | null;
  reward_summary: RewardSummary;
  reward_history: RewardHistory[];
  source?: "store" | "neynar" | "none";
};

type SocialPost = {
  hash: string;
  text: string;
  created_at: string;
  likes: number;
  recasts: number;
  replies: number;
};

type SocialPayload = {
  casts: number;
  likes: number;
  recasts: number;
  replies: number;
  top_posts: SocialPost[];
};

// ===== Support config =====
const BUILDER_ADDRESS = "0xd4a1D777e2882487d47c96bc23A47CeaB4f4f18A" as const;
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const USDC_PRESETS = [0.5, 1, 2, 5, 10];

function errToMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

function errToShortMessage(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const rec = err as Record<string, unknown>;
  const sm = rec["shortMessage"];
  return typeof sm === "string" ? sm : null;
}

function formatUsd(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  try {
    return `$${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(v)}`;
  } catch {
    return `$${v}`;
  }
}
function formatInt(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${v}`;
  }
}
function clampAmountString(v: string, maxDecimals: number) {
  const cleaned = v.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned;
  const head = parts[0];
  const tail = parts.slice(1).join("").slice(0, maxDecimals);
  return `${head}.${tail}`;
}
function toIsoUtc(d: Date) {
  return d.toISOString();
}
function prettyWindowLabel(startIso: string, endIso: string) {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const pad = (x: number) => String(x).padStart(2, "0");
  const fmt = (dt: Date) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  return `[${fmt(s)} → ${fmt(e)}]`;
}

function baseProfileUrl(address: string, username?: string | null) {
  if (username && username.trim().length > 0) {
    const first = username.startsWith("@") ? username.slice(1) : username;
    return `https://base.app/profile/${encodeURIComponent(first)}`;
  }
  return `https://base.app/profile/${encodeURIComponent(address)}`;
}

function StatPill({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        borderRadius: 999,
        background: "#EEF3FF",
        border: "1px solid rgba(0,0,0,0.06)",
        fontWeight: 900,
        color: "#0A0A0A",
        width: "100%",
      }}
    >
      <span style={{ display: "grid", placeItems: "center" }}>{icon}</span>
      <span style={{ opacity: 0.75, fontSize: 13 }}>{label}:</span>
      <span style={{ fontWeight: 1100, fontSize: 14 }}>{value}</span>
    </div>
  );
}

function OnchainCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div
      style={{
        background: "#0000FF",
        color: "#fff",
        borderRadius: 22,
        padding: 18,
        boxShadow: "0 18px 40px rgba(0,0,255,0.22)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <div style={{ fontWeight: 1000, opacity: 0.92, fontSize: 13 }}>{title}</div>
      <div style={{ marginTop: 10, fontWeight: 1300, fontSize: 40, letterSpacing: -0.5 }}>{value}</div>
      {subtitle ? (
        <div style={{ marginTop: 8, fontWeight: 900, opacity: 0.9, fontSize: 13 }}>{subtitle}</div>
      ) : null}
    </div>
  );
}

function SoftStatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 16,
        borderRadius: 18,
        background: "rgba(255,255,255,0.80)",
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 12px 28px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            display: "grid",
            placeItems: "center",
            background: "rgba(0,0,255,0.08)",
            border: "1px solid rgba(0,0,255,0.18)",
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 1000, color: "rgba(0,0,0,0.55)" }}>{label}</div>
          <div style={{ fontSize: 24, fontWeight: 1100, color: "#0A0A0A", marginTop: 2 }}>{formatInt(value)}</div>
        </div>
      </div>
    </div>
  );
}

export default function ProfileDashboardClient(props: { address?: `0x${string}` }) {
  // hooks MUST stay top-level
  const { context } = useMiniKit();
  const inBaseApp = Boolean(context);

  const { address: wagmiAddress } = useAccount();
  const activeAddress = (props.address ?? wagmiAddress) as `0x${string}` | undefined;

  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync, isPending: ethPending } = useSendTransaction();
  const { writeContractAsync, isPending: usdcPending } = useWriteContract();

  // ===== Data state =====
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [socialCurrent, setSocialCurrent] = useState<SocialPayload | null>(null);
  const [socialLast, setSocialLast] = useState<SocialPayload | null>(null);
  const [socialErr, setSocialErr] = useState<string | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);

  // ===== PFP fallback handling =====
  const [pfpBroken, setPfpBroken] = useState(false);

  // ===== Support state =====
  const [asset, setAsset] = useState<"USDC" | "ETH">("USDC");
  const [usdcAmount, setUsdcAmount] = useState<string>("1");
  const [ethAmount, setEthAmount] = useState<string>("0.001");
  const [supportMsg, setSupportMsg] = useState<string | null>(null);

  // ===== Load Profile =====
  useEffect(() => {
    let alive = true;

    async function run() {
      setProfile(null);
      setProfileErr(null);
      setPfpBroken(false);

      if (!activeAddress) return;

      setProfileLoading(true);
      try {
        const res = await fetch(`/api/profile?address=${activeAddress}&resolve=1`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Profile API failed (${res.status})`);
        const json = (await res.json()) as ProfilePayload;
        if (!alive) return;
        setProfile(json);
      } catch (e: unknown) {
        if (!alive) return;
        setProfileErr(errToMessage(e));
      } finally {
        if (!alive) return;
        setProfileLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [activeAddress]);

  const u = profile?.farcaster_user ?? null;
  const rs = profile?.reward_summary ?? null;
  const rh = profile?.reward_history ?? [];

  const latestWeekStartIso = rs?.latest_week_start_utc ?? null;

  const currentWindow = useMemo(() => {
    if (!latestWeekStartIso) return null;
    const start = new Date(latestWeekStartIso);
    const end = new Date();
    return { startIso: toIsoUtc(start), endIso: toIsoUtc(end) };
  }, [latestWeekStartIso]);

  const lastRewardWindow = useMemo(() => {
    if (!latestWeekStartIso) return null;
    const end = new Date(latestWeekStartIso);
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { startIso: toIsoUtc(start), endIso: toIsoUtc(end) };
  }, [latestWeekStartIso]);

  // ===== Load Social =====
  useEffect(() => {
    let alive = true;

    async function run() {
      setSocialCurrent(null);
      setSocialLast(null);
      setSocialErr(null);

      const fid = u?.fid ?? null;
      if (!fid || !currentWindow || !lastRewardWindow) return;

      setSocialLoading(true);
      try {
        const r1 = await fetch(
          `/api/social?fid=${fid}&start=${encodeURIComponent(currentWindow.startIso)}&end=${encodeURIComponent(
            currentWindow.endIso
          )}&includeTopPosts=0`,
          { cache: "no-store" }
        );
        if (!r1.ok) throw new Error(`Social(current) failed (${r1.status})`);
        const j1 = (await r1.json()) as SocialPayload;

        const r2 = await fetch(
          `/api/social?fid=${fid}&start=${encodeURIComponent(lastRewardWindow.startIso)}&end=${encodeURIComponent(
            lastRewardWindow.endIso
          )}&includeTopPosts=1`,
          { cache: "no-store" }
        );
        if (!r2.ok) throw new Error(`Social(last window) failed (${r2.status})`);
        const j2 = (await r2.json()) as SocialPayload;

        if (!alive) return;
        setSocialCurrent(j1);
        setSocialLast(j2);
      } catch (e: unknown) {
        if (!alive) return;
        setSocialErr(errToMessage(e));
      } finally {
        if (!alive) return;
        setSocialLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [u?.fid, currentWindow, lastRewardWindow]);

  const visitUrl = useMemo(() => {
    if (!activeAddress) return null;
    return baseProfileUrl(activeAddress, u?.username ?? null);
  }, [activeAddress, u?.username]);

  async function ensureBase() {
    try {
      await switchChainAsync?.({ chainId: base.id });
    } catch {
      // wallet may handle network prompt itself
    }
  }

  async function sendSupport() {
    setSupportMsg(null);

    try {
      await ensureBase();

      if (asset === "ETH") {
        const amt = ethAmount.trim();
        if (!amt || Number(amt) <= 0) throw new Error("Enter an ETH amount");
        await sendTransactionAsync({
          to: BUILDER_ADDRESS,
          value: parseEther(amt),
          chainId: base.id,
        });
        setSupportMsg("✅ ETH sent. Thank you!");
        return;
      }

      const amt = usdcAmount.trim();
      if (!amt || Number(amt) <= 0) throw new Error("Select or enter a USDC amount");

      await writeContractAsync({
        address: BASE_USDC,
        abi: erc20Abi,
        functionName: "transfer",
        args: [BUILDER_ADDRESS, parseUnits(amt, 6)],
        chainId: base.id,
      });

      setSupportMsg("✅ USDC sent. Thank you!");
    } catch (e: unknown) {
      setSupportMsg(errToShortMessage(e) ?? errToMessage(e) ?? "Transaction failed or rejected.");
    }
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      {!inBaseApp ? (
        <div className="card card-pad" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 1000, fontSize: 14 }}>Tip</div>
          <div className="subtle" style={{ marginTop: 6 }}>
            For the best experience, open this inside the <b>Base app</b> Miniapp.
          </div>
        </div>
      ) : null}

      {!activeAddress ? (
        <div className="card card-pad">
          <div style={{ fontWeight: 1100, fontSize: 16, color: "#0A0A0A" }}>Connect wallet</div>
          <div className="subtle" style={{ marginTop: 6 }}>
            Please connect your wallet to load your Profile.
          </div>
        </div>
      ) : null}

      {/* ===== PROFILE HEADER ===== */}
      <div
        style={{
          marginTop: 10,
          background: "#fff",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 22,
          padding: 16,
          boxShadow: "0 12px 28px rgba(0,0,0,0.06)",
        }}
      >
        {profileLoading ? (
          <div style={{ height: 120, borderRadius: 16, background: "rgba(0,0,0,0.06)" }} />
        ) : profileErr ? (
          <div style={{ color: "#B91C1C", fontWeight: 1000 }}>{profileErr}</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              {/* Use <img> to guarantee PFP works without Next remotePatterns */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={!pfpBroken ? (u?.pfp_url || "/icon.png") : "/icon.png"}
                alt="pfp"
                width={78}
                height={78}
                onError={() => setPfpBroken(true)}
                style={{
                  width: 78,
                  height: 78,
                  borderRadius: 18,
                  objectFit: "cover",
                  background: "rgba(0,0,0,0.04)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  flex: "0 0 auto",
                }}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 1200,
                    color: "#0A0A0A",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {u?.display_name || u?.username || "Unknown"}
                </div>

                <div
                  style={{
                    marginTop: 4,
                    color: "#0000FF",
                    fontWeight: 1100,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 16,
                  }}
                >
                  @{u?.username || "unknown"}
                </div>
              </div>
            </div>

            {u?.bio ? (
              <div style={{ marginTop: 10, color: "rgba(0,0,0,0.65)", fontWeight: 700, lineHeight: 1.35 }}>
                {u.bio}
              </div>
            ) : null}

            {/* Pills: force 2 columns so Following + Followers stay on same row */}
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <StatPill label="Score" value={(u?.score ?? 0).toFixed(2)} icon={<span>🪐</span>} />
              <StatPill label="FID" value={formatInt(u?.fid ?? 0)} icon={<span>🆔</span>} />
              <StatPill label="Following" value={formatInt(u?.following_count ?? 0)} icon={<span>➕</span>} />
              <StatPill label="Followers" value={formatInt(u?.follower_count ?? 0)} icon={<span>👥</span>} />
            </div>
          </>
        )}
      </div>

      {/* Visit button text + perfect center */}
      {visitUrl ? (
        <a
          href={visitUrl}
          target="_blank"
          rel="noreferrer"
          className="btn btnPrimary"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 12,
            height: 54,
            borderRadius: 18,
            fontWeight: 1100,
            fontSize: 16,
            boxShadow: "0 18px 40px rgba(0,0,255,0.22)",
            textDecoration: "none",
          }}
        >
          Visit your profile on Baseapp
        </a>
      ) : null}

      {/* ===== Onchain rewards (now uses YOUR API field names) ===== */}
      {profile ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 1100, fontSize: 22, color: "#0A0A0A" }}>Onchain rewards</div>
          <div className="subtle" style={{ marginTop: 4 }}>
            Your Base app weekly reward stats
          </div>

          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <OnchainCard title="All-time rewards" value={formatUsd(rs?.all_time_usdc ?? 0)} />
            <OnchainCard title="Earning weeks" value={formatInt(rs?.earning_weeks ?? 0)} />
            <OnchainCard
              title={rs?.latest_week_label || "Current week"}
              value={formatUsd(rs?.latest_week_usdc ?? 0)}
              subtitle="Current week"
            />
            <OnchainCard
              title={rs?.prev_week_label || "Previous week"}
              value={formatUsd(rs?.prev_week_usdc ?? 0)}
              subtitle="Previous week"
            />
          </div>

          {/* Weekly wins */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 1100, fontSize: 18, color: "#0A0A0A" }}>Weekly reward wins</div>
            <div className="subtle" style={{ marginTop: 4 }}>
              Only weeks with rewards are shown
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {rh.slice(0, 12).map((w) => (
                <div
                  key={w.week_number}
                  className="card"
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    border: "1px solid rgba(0,0,0,0.10)",
                    background: "rgba(255,255,255,0.92)",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 1100, color: "#0000FF" }}>
                    {w.week_label.split("–")[0].trim()}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 1200, marginTop: 6 }}>{formatUsd(w.usdc)}</div>
                  <div className="subtle" style={{ marginTop: 6, fontSize: 11 }}>
                    {w.week_label.split("–").slice(1).join("–").trim()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ===== Social (unchanged) ===== */}
      {profile ? (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontWeight: 1100, fontSize: 18, color: "#0A0A0A" }}>Social</div>
          <div className="subtle" style={{ marginTop: 4 }}>
            Engagement on your Farcaster posts
          </div>

          {socialLoading ? (
            <div className="card card-pad" style={{ marginTop: 12 }}>
              <div className="subtle">Loading social…</div>
            </div>
          ) : socialErr ? (
            <div className="card card-pad" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 1000, color: "#B91C1C" }}>Social load failed</div>
              <div className="subtle" style={{ marginTop: 6 }}>{socialErr}</div>
            </div>
          ) : (
            <>
              {socialCurrent && currentWindow ? (
                <div className="card card-pad" style={{ marginTop: 12, background: "rgba(245,248,255,0.92)" }}>
                  <div style={{ fontWeight: 1100, fontSize: 16, color: "#0A0A0A" }}>Current social activity</div>
                  <div className="subtle" style={{ marginTop: 4 }}>
                    {prettyWindowLabel(currentWindow.startIso, currentWindow.endIso)}
                  </div>

                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <SoftStatCard icon={<span style={{ fontSize: 18 }}>📝</span>} label="Casts" value={socialCurrent.casts} />
                    <SoftStatCard icon={<span style={{ fontSize: 18 }}>❤️</span>} label="Likes" value={socialCurrent.likes} />
                    <SoftStatCard icon={<span style={{ fontSize: 18 }}>🔁</span>} label="Recasts" value={socialCurrent.recasts} />
                    <SoftStatCard icon={<span style={{ fontSize: 18 }}>💬</span>} label="Replies" value={socialCurrent.replies} />
                  </div>
                </div>
              ) : null}

              {socialLast && lastRewardWindow ? (
                <div className="card card-pad" style={{ marginTop: 12, background: "rgba(245,248,255,0.78)" }}>
                  <div style={{ fontWeight: 1100, fontSize: 16, color: "#0A0A0A" }}>Social activity of last reward window</div>
                  <div className="subtle" style={{ marginTop: 4 }}>
                    {prettyWindowLabel(lastRewardWindow.startIso, lastRewardWindow.endIso)}
                  </div>

                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <SoftStatCard icon={<span style={{ fontSize: 18 }}>📝</span>} label="Casts" value={socialLast.casts} />
                    <SoftStatCard icon={<span style={{ fontSize: 18 }}>❤️</span>} label="Likes" value={socialLast.likes} />
                    <SoftStatCard icon={<span style={{ fontSize: 18 }}>🔁</span>} label="Recasts" value={socialLast.recasts} />
                    <SoftStatCard icon={<span style={{ fontSize: 18 }}>💬</span>} label="Replies" value={socialLast.replies} />
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontWeight: 1100, color: "#0A0A0A" }}>Top posts</div>
                    <div className="subtle" style={{ marginTop: 4 }}>Top 7 posts in this window</div>

                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                      {socialLast.top_posts.length === 0 ? (
                        <div className="subtle" style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)" }}>
                          No posts found in this timeframe.
                        </div>
                      ) : (
                        socialLast.top_posts.map((p) => (
                          <div key={p.hash} className="card" style={{ padding: 14, borderRadius: 16, border: "1px solid rgba(0,0,0,0.08)" }}>
                            <div style={{ fontWeight: 1000, color: "#0A0A0A", lineHeight: 1.35 }}>{p.text || "—"}</div>
                            <div className="subtle" style={{ marginTop: 8, display: "flex", gap: 14 }}>
                              <span>❤️ {formatInt(p.likes)}</span>
                              <span>🔁 {formatInt(p.recasts)}</span>
                              <span>💬 {formatInt(p.replies)}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {/* ===== Support (unchanged) ===== */}
      <div style={{ marginTop: 22 }}>
        <div style={{ fontWeight: 1100, fontSize: 18, color: "#0A0A0A" }}>Support the builder</div>
        <div className="subtle" style={{ marginTop: 4 }}>
          Sends funds directly from your wallet → builder address. You confirm inside your wallet.
        </div>

        <div className="card card-pad" style={{ marginTop: 12, background: "rgba(245,248,255,0.92)" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setAsset("USDC")} className={asset === "USDC" ? "btn btnPrimary" : "btn"} style={{ borderRadius: 999 }}>
              USDC
            </button>
            <button type="button" onClick={() => setAsset("ETH")} className={asset === "ETH" ? "btn btnPrimary" : "btn"} style={{ borderRadius: 999 }}>
              ETH
            </button>
          </div>

          {asset === "USDC" ? (
            <>
              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {USDC_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setUsdcAmount(String(p))}
                    className={Number(usdcAmount) === p ? "btn btnPrimary" : "btn"}
                    style={{ borderRadius: 999 }}
                  >
                    ${p}
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 1000, opacity: 0.7 }}>Custom</div>
                <input
                  value={usdcAmount}
                  onChange={(e) => setUsdcAmount(clampAmountString(e.target.value, 6))}
                  inputMode="decimal"
                  placeholder="1"
                  style={{ flex: 1, borderRadius: 14, border: "1px solid rgba(0,0,0,0.12)", padding: "10px 12px", fontWeight: 1000, outline: "none" }}
                />
                <div style={{ fontSize: 12, fontWeight: 1000 }}>USDC</div>
              </div>
            </>
          ) : (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 1000, opacity: 0.7 }}>Amount</div>
              <input
                value={ethAmount}
                onChange={(e) => setEthAmount(clampAmountString(e.target.value, 18))}
                inputMode="decimal"
                placeholder="0.001"
                style={{ flex: 1, borderRadius: 14, border: "1px solid rgba(0,0,0,0.12)", padding: "10px 12px", fontWeight: 1000, outline: "none" }}
              />
              <div style={{ fontSize: 12, fontWeight: 1000 }}>ETH</div>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <button type="button" onClick={sendSupport} className="btn btnPrimary" disabled={ethPending || usdcPending} style={{ width: "100%", height: 44 }}>
              {ethPending || usdcPending ? "Sending…" : "Send support"}
            </button>
          </div>

          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
            <div className="subtle" style={{ flex: 1, wordBreak: "break-all" }}>
              Builder: {BUILDER_ADDRESS}
            </div>
            <CopyButton value={BUILDER_ADDRESS} mode="icon" />
          </div>

          {supportMsg ? (
            <div style={{ marginTop: 10, fontSize: 13, fontWeight: 900, color: supportMsg.startsWith("✅") ? "#065F46" : "#6B7280" }}>
              {supportMsg}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
