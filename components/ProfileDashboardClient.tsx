"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useSendTransaction, useSwitchChain, useWriteContract } from "wagmi";
import { base } from "viem/chains";
import { erc20Abi, parseEther, parseUnits } from "viem";
import CopyButton from "@/components/CopyButton";

type FarcasterUser = {
  fid: number;
  username: string;
  display_name: string;
  pfp_url: string;
  follower_count: number;
  following_count: number;
  score: number;
  // NOTE: exists in payload, but we intentionally DO NOT render it on profile
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
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const; // Base USDC (6 decimals)
const USDC_PRESETS = [0.5, 1, 2, 5, 10];

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

function Pill({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.08)",
        background: "rgba(245,248,255,0.95)",
        fontWeight: 900,
        fontSize: 13,
      }}
    >
      <span style={{ opacity: 0.8 }}>{icon ?? null}</span>
      <span style={{ opacity: 0.7 }}>{label}:</span>
      <span style={{ color: "#0A0A0A" }}>{value}</span>
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

export default function ProfileDashboardClient({ address }: { address: `0x${string}` }) {
  const { context } = useMiniKit();
  const inBaseApp = Boolean(context);

  // ===== Data state =====
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [socialCurrent, setSocialCurrent] = useState<SocialPayload | null>(null);
  const [socialLast, setSocialLast] = useState<SocialPayload | null>(null);
  const [socialErr, setSocialErr] = useState<string | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);

  // ===== Support state =====
  const [asset, setAsset] = useState<"USDC" | "ETH">("USDC"); // default USDC
  const [usdcAmount, setUsdcAmount] = useState<string>("1");
  const [ethAmount, setEthAmount] = useState<string>("0.001");
  const [supportMsg, setSupportMsg] = useState<string | null>(null);

  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync, isPending: ethPending } = useSendTransaction();
  const { writeContractAsync, isPending: usdcPending } = useWriteContract();

  // ===== Load Profile (uses store first, Neynar for missing users) =====
  useEffect(() => {
    let alive = true;

    async function run() {
      setProfile(null);
      setProfileErr(null);
      setProfileLoading(true);

      try {
        const res = await fetch(`/api/profile?address=${address}&resolve=1`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Profile API failed (${res.status})`);
        const json = (await res.json()) as ProfilePayload;
        if (!alive) return;
        setProfile(json);
      } catch (e: any) {
        if (!alive) return;
        setProfileErr(e?.message ?? "Failed to load profile");
      } finally {
        if (!alive) return;
        setProfileLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [address]);

  const latestWeekStartIso = profile?.reward_summary?.latest_week_start_utc ?? null;

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

  // ===== Load Social (2 blocks) =====
  useEffect(() => {
    let alive = true;

    async function run() {
      setSocialCurrent(null);
      setSocialLast(null);
      setSocialErr(null);

      const fid = profile?.farcaster_user?.fid ?? null;
      if (!fid || !currentWindow || !lastRewardWindow) return;

      setSocialLoading(true);
      try {
        // Current window (NO top posts)
        const r1 = await fetch(
          `/api/social?fid=${fid}&start=${encodeURIComponent(currentWindow.startIso)}&end=${encodeURIComponent(
            currentWindow.endIso
          )}&includeTopPosts=0`,
          { cache: "no-store" }
        );
        if (!r1.ok) throw new Error(`Social(current) failed (${r1.status})`);
        const j1 = (await r1.json()) as SocialPayload;

        // Last reward window (keep top posts)
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
      } catch (e: any) {
        if (!alive) return;
        setSocialErr(e?.message ?? "Failed to load social stats");
      } finally {
        if (!alive) return;
        setSocialLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [profile?.farcaster_user?.fid, currentWindow, lastRewardWindow]);

  async function ensureBase() {
    // Base App wallet usually is already on Base, but we handle it safely.
    try {
      await switchChainAsync?.({ chainId: base.id });
    } catch {
      // If switchChain fails (some wallets), we still try to send and let wallet handle network prompt.
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

      // USDC
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
    } catch (e: any) {
      setSupportMsg(e?.shortMessage ?? e?.message ?? "Transaction failed or rejected.");
    }
  }

  // ===== Render helpers =====
  const u = profile?.farcaster_user ?? null;
  const rs = profile?.reward_summary ?? null;
  const rh = profile?.reward_history ?? [];

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

      {/* ===== Profile header (Match Find style, but WITHOUT bio/copy/visit/change wallet) ===== */}
      <div className="card card-pad">
        {profileLoading ? (
          <div style={{ height: 70, borderRadius: 16, background: "rgba(0,0,0,0.06)" }} />
        ) : profileErr ? (
          <div style={{ color: "#B91C1C", fontWeight: 1000 }}>{profileErr}</div>
        ) : !profile ? null : (
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <Image
              src={u?.pfp_url || "/icon.png"}
              alt="pfp"
              width={72}
              height={72}
              style={{
                borderRadius: 18,
                border: "1px solid rgba(0,0,0,0.10)",
                background: "rgba(0,0,0,0.03)",
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 1100,
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
                  marginTop: 2,
                  color: "#0000FF",
                  fontWeight: 1000,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                @{u?.username || "unknown"}
              </div>

              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Pill label="Score" value={(u?.score ?? 0).toFixed(2)} icon={<span>🪐</span>} />
                <Pill label="FID" value={formatInt(u?.fid ?? 0)} icon={<span>🆔</span>} />
                <Pill label="Following" value={formatInt(u?.following_count ?? 0)} icon={<span>➕</span>} />
                <Pill label="Followers" value={formatInt(u?.follower_count ?? 0)} icon={<span>👥</span>} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== Onchain rewards (same structure as Find) ===== */}
      {profile ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 1100, fontSize: 18, color: "#0A0A0A" }}>Onchain rewards</div>
          <div className="subtle" style={{ marginTop: 4 }}>
            Your Base app weekly reward stats
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div
              className="card"
              style={{
                padding: 16,
                borderRadius: 18,
                background: "#0000FF",
                color: "white",
                boxShadow: "0 18px 40px rgba(0,0,255,0.20)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 1000, opacity: 0.9 }}>All-time rewards</div>
              <div style={{ fontSize: 28, fontWeight: 1200, marginTop: 6 }}>
                {formatUsd(rs?.all_time_usdc ?? 0)}
              </div>
            </div>

            <div
              className="card"
              style={{
                padding: 16,
                borderRadius: 18,
                background: "#0000FF",
                color: "white",
                boxShadow: "0 18px 40px rgba(0,0,255,0.20)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 1000, opacity: 0.9 }}>Earning weeks</div>
              <div style={{ fontSize: 28, fontWeight: 1200, marginTop: 6 }}>
                {formatInt(rs?.earning_weeks ?? 0)}
              </div>
            </div>

            <div
              className="card"
              style={{
                padding: 16,
                borderRadius: 18,
                background: "#0000FF",
                color: "white",
                boxShadow: "0 18px 40px rgba(0,0,255,0.20)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 1000, opacity: 0.9 }}>{rs?.latest_week_label || "Current week"}</div>
              <div style={{ fontSize: 28, fontWeight: 1200, marginTop: 6 }}>
                {formatUsd(rs?.latest_week_usdc ?? 0)}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 900, opacity: 0.9 }}>Current week</div>
            </div>

            <div
              className="card"
              style={{
                padding: 16,
                borderRadius: 18,
                background: "#0000FF",
                color: "white",
                boxShadow: "0 18px 40px rgba(0,0,255,0.20)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 1000, opacity: 0.9 }}>{rs?.prev_week_label || "Previous week"}</div>
              <div style={{ fontSize: 28, fontWeight: 1200, marginTop: 6 }}>
                {formatUsd(rs?.prev_week_usdc ?? 0)}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 900, opacity: 0.9 }}>Previous week</div>
            </div>
          </div>

          {/* Weekly reward wins (restored) */}
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
                  <div style={{ fontSize: 13, fontWeight: 1100, color: "#0000FF" }}>{w.week_label.split("–")[0].trim()}</div>
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

      {/* ===== Social (keep; current block no top posts) ===== */}
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
                <div
                  className="card card-pad"
                  style={{
                    marginTop: 12,
                    background: "linear-gradient(180deg, rgba(245,248,255,0.92) 0%, rgba(255,255,255,0.90) 100%)",
                    border: "1px solid rgba(0,0,0,0.08)",
                    boxShadow: "0 16px 40px rgba(0,0,0,0.06)",
                  }}
                >
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
                <div
                  className="card card-pad"
                  style={{
                    marginTop: 12,
                    background: "rgba(245,248,255,0.78)",
                    border: "1px solid rgba(0,0,0,0.08)",
                  }}
                >
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

                  {/* Top posts only in last window (current window stays clean) */}
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontWeight: 1100, color: "#0A0A0A" }}>Top posts</div>
                    <div className="subtle" style={{ marginTop: 4 }}>
                      Top 7 posts in this window
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                      {socialLast.top_posts.length === 0 ? (
                        <div
                          className="subtle"
                          style={{
                            padding: 12,
                            borderRadius: 14,
                            border: "1px solid rgba(0,0,0,0.08)",
                            background: "rgba(255,255,255,0.8)",
                          }}
                        >
                          No posts found in this timeframe.
                        </div>
                      ) : (
                        socialLast.top_posts.map((p) => (
                          <div
                            key={p.hash}
                            className="card"
                            style={{
                              padding: 14,
                              borderRadius: 16,
                              border: "1px solid rgba(0,0,0,0.08)",
                              background: "rgba(255,255,255,0.92)",
                            }}
                          >
                            <div style={{ fontWeight: 1000, color: "#0A0A0A", lineHeight: 1.35 }}>
                              {p.text || "—"}
                            </div>
                            <div className="subtle" style={{ marginTop: 8, display: "flex", gap: 14, alignItems: "center" }}>
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

      {/* ===== Support (USDC presets+custom, ETH custom) ===== */}
      <div style={{ marginTop: 22 }}>
        <div style={{ fontWeight: 1100, fontSize: 18, color: "#0A0A0A" }}>Support the builder</div>
        <div className="subtle" style={{ marginTop: 4 }}>
          Sends funds directly from your wallet → builder address. You confirm inside your wallet.
        </div>

        <div
          className="card card-pad"
          style={{
            marginTop: 12,
            background: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(245,248,255,0.92) 100%)",
            border: "1px solid rgba(0,0,0,0.08)",
            boxShadow: "0 14px 38px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setAsset("USDC")}
              className={asset === "USDC" ? "btn btnPrimary" : "btn"}
              style={{ borderRadius: 999 }}
            >
              USDC
            </button>
            <button
              type="button"
              onClick={() => setAsset("ETH")}
              className={asset === "ETH" ? "btn btnPrimary" : "btn"}
              style={{ borderRadius: 999 }}
            >
              ETH
            </button>
          </div>

          {asset === "USDC" ? (
            <>
              <div style={{ marginTop: 12, fontWeight: 1000, color: "rgba(0,0,0,0.7)" }}>Choose amount</div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                {USDC_PRESETS.map((p) => {
                  const active = Number(usdcAmount) === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setUsdcAmount(String(p))}
                      className={active ? "btn btnPrimary" : "btn"}
                      style={{ borderRadius: 999, paddingInline: 14 }}
                    >
                      ${p}
                    </button>
                  );
                })}
              </div>

              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 1000, color: "rgba(0,0,0,0.55)" }}>Custom</div>
                <input
                  value={usdcAmount}
                  onChange={(e) => setUsdcAmount(clampAmountString(e.target.value, 6))}
                  inputMode="decimal"
                  placeholder="1"
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    border: "1px solid rgba(0,0,0,0.12)",
                    padding: "10px 12px",
                    fontWeight: 1000,
                    outline: "none",
                    background: "rgba(255,255,255,0.92)",
                  }}
                />
                <div style={{ fontSize: 12, fontWeight: 1000, color: "#0A0A0A" }}>USDC</div>
              </div>
            </>
          ) : (
            <>
              <div style={{ marginTop: 12, fontWeight: 1000, color: "rgba(0,0,0,0.7)" }}>Custom amount</div>
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  value={ethAmount}
                  onChange={(e) => setEthAmount(clampAmountString(e.target.value, 18))}
                  inputMode="decimal"
                  placeholder="0.001"
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    border: "1px solid rgba(0,0,0,0.12)",
                    padding: "10px 12px",
                    fontWeight: 1000,
                    outline: "none",
                    background: "rgba(255,255,255,0.92)",
                  }}
                />
                <div style={{ fontSize: 12, fontWeight: 1000, color: "#0A0A0A" }}>ETH</div>
              </div>
            </>
          )}

          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              onClick={sendSupport}
              className="btn btnPrimary"
              disabled={ethPending || usdcPending}
              style={{ width: "100%", height: 44 }}
            >
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

        {/* Credits (simple) */}
        <div style={{ marginTop: 14 }}>
          <div className="card card-pad">
            <div style={{ fontSize: 13, color: "rgba(0,0,0,0.65)", fontWeight: 900 }}>
              created by 🅰️kbar |{" "}
              <a href="https://x.com/akbarX402" target="_blank" rel="noreferrer">
                x
              </a>{" "}
              |{" "}
              <a href="https://base.app/profile/akbaronchain" target="_blank" rel="noreferrer">
                baseapp
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
