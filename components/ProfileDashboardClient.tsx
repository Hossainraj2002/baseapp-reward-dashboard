"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useAccount, useSendTransaction, useSwitchChain, useWriteContract } from "wagmi";
import { base } from "viem/chains";
import { erc20Abi, parseEther, parseUnits } from "viem";

import type { ProfilePayload } from "@/lib/profilePayload";

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

function formatUSDC(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatInt(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
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

/**
 * Baseapp profile routing rule:
 * - If Farcaster username ends with ".base.eth", use the first label (before the first dot)
 *   Example: "akbaronchain.base.eth" -> "akbaronchain"
 * - Otherwise, use the wallet address
 */
function buildBaseappProfileUrl(params: { username: string | null; address: string }): string {
  const { username, address } = params;

  const cleanAddress = address.trim();
  const cleanUsername = (username || "").trim();

  if (cleanUsername.length > 0) {
    const lower = cleanUsername.toLowerCase();
    if (lower.endsWith(".base.eth")) {
      const first = cleanUsername.split(".")[0] || cleanUsername;
      return `https://base.app/profile/${encodeURIComponent(first)}`;
    }
  }

  return `https://base.app/profile/${encodeURIComponent(cleanAddress)}`;
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={chip}>
      <span style={chipLabel}>{label}</span>
      <span style={chipValue}>{value}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 950, marginTop: 14, marginBottom: 10, color: "#0A0A0A" }}>
      {children}
    </div>
  );
}

function OnchainCard({ title, value, sub }: { title: string; value: string; sub?: string | null }) {
  return (
    <div style={onchainCard}>
      <div style={onchainTitle}>{title}</div>
      <div style={onchainValue}>{value}</div>
      {sub ? <div style={onchainSub}>{sub}</div> : null}
    </div>
  );
}

function SoftStatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
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

/** minimal safe shape without `any` */
type MiniKitContextLike = {
  user?: {
    walletAddress?: string;
    address?: string;
  };
  walletAddress?: string;
  address?: string;
} | null;

export default function ProfileDashboardClient() {
  const { context } = useMiniKit();
  const inBaseApp = Boolean(context);

  const { address: wagmiAddress } = useAccount();

  const activeAddress: `0x${string}` | null = useMemo(() => {
    const c = (context ?? null) as MiniKitContextLike;

    const candidates: Array<unknown> = [
      c?.user?.walletAddress,
      c?.user?.address,
      c?.walletAddress,
      c?.address,
      wagmiAddress,
    ];

    for (const v of candidates) {
      if (typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v)) return v as `0x${string}`;
    }
    return null;
  }, [context, wagmiAddress]);

  // ===== Data state =====
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [socialCurrent, setSocialCurrent] = useState<SocialPayload | null>(null);
  const [socialLast, setSocialLast] = useState<SocialPayload | null>(null);
  const [socialErr, setSocialErr] = useState<string | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);

  // ===== Support state =====
  const [asset, setAsset] = useState<"USDC" | "ETH">("USDC");
  const [usdcAmount, setUsdcAmount] = useState<string>("1");
  const [ethAmount, setEthAmount] = useState<string>("0.001");
  const [supportMsg, setSupportMsg] = useState<string | null>(null);

  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync, isPending: ethPending } = useSendTransaction();
  const { writeContractAsync, isPending: usdcPending } = useWriteContract();

  // ===== Load Profile =====
  useEffect(() => {
    let alive = true;

    async function run() {
      setProfile(null);
      setProfileErr(null);

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

      const fc2 = (profile as unknown as { farcaster?: { fid?: number }; farcaster_user?: { fid?: number } } | null);
      const fid: number | null = fc2?.farcaster?.fid ?? fc2?.farcaster_user?.fid ?? null;


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
  }, [profile, currentWindow, lastRewardWindow]);

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

  const data = profile;
  const addr = activeAddress ?? (profile?.address as `0x${string}` | undefined) ?? null;

  // read farcaster object safely (support both shapes)
  const fcRaw = (data as unknown as { farcaster?: unknown; farcaster_user?: unknown }) || {};
  const fc = (fcRaw.farcaster ?? fcRaw.farcaster_user ?? null) as
    | {
        fid?: number;
        username?: string;
        display_name?: string;
        pfp_url?: string;
        follower_count?: number;
        following_count?: number;
        score?: number;
        neynar_user_score?: number;
      }
    | null;

  const scoreValue =
    fc?.score != null ? fc.score.toFixed(2) : fc?.neynar_user_score != null ? fc.neynar_user_score.toFixed(2) : null;

  const followers = fc?.follower_count != null ? formatInt(fc.follower_count) : null;
  const following = fc?.following_count != null ? formatInt(fc.following_count) : null;
  const fid = fc?.fid != null ? formatInt(fc.fid) : null;

  const displayName = fc?.display_name || (fc?.username ? fc.username : addr ?? "Unknown");
  const usernameLine = fc?.username ? `@${fc.username}` : addr ?? "—";

  const baseappUrl = addr
    ? buildBaseappProfileUrl({
        username: fc?.username ?? null,
        address: addr,
      })
    : null;

  const historyNewestFirst = useMemo(() => {
    const h = data?.reward_history ? [...data.reward_history] : [];
    h.sort((a, b) => b.week_number - a.week_number);
    return h;
  }, [data?.reward_history]);

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

      {/* Profile header (Find/address style, no bio, no copy) */}
      <div className="card" style={headerCard}>
        {profileLoading ? (
          <div style={{ height: 90, borderRadius: 16, background: "rgba(0,0,0,0.06)" }} />
        ) : profileErr ? (
          <div style={{ color: "#B91C1C", fontWeight: 900 }}>{profileErr}</div>
        ) : !data ? (
          <div style={{ color: "#6B7280", fontWeight: 900 }}>
            {activeAddress ? "No profile payload returned." : "Open inside Base app to load your profile."}
          </div>
        ) : (
          <>
            <div style={topRow}>
              <div style={avatarWrap}>
                {fc?.pfp_url ? (
                  <img src={fc.pfp_url} alt="" style={avatarImg} loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  <div style={avatarFallback} />
                )}
              </div>

              <div style={nameBlock}>
                <div style={nameRow}>
                  <div style={displayNameStyle} title={displayName}>
                    {displayName}
                  </div>
                </div>
                <div style={usernameStyle}>{usernameLine}</div>
              </div>
            </div>

            <div style={fullWidthInfo}>
              <div style={statsBlock}>
                <div style={statsRow}>
                  {scoreValue ? <StatChip label="Score:" value={scoreValue} /> : null}
                  {fid ? <StatChip label="FID:" value={fid} /> : null}
                </div>
                <div style={statsRow}>
                  {following ? <StatChip label="Following:" value={following} /> : null}
                  {followers ? <StatChip label="Followers:" value={followers} /> : null}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {baseappUrl ? (
        <a href={baseappUrl} target="_blank" rel="noreferrer noopener" className="btn btnPrimary" style={baseappBtn}>
          Visit your profile on Baseapp
        </a>
      ) : null}

      {/* Onchain rewards (same fields as Find/address) */}
      {data ? (
        <>
          <SectionTitle>Onchain rewards</SectionTitle>
          <div style={cardsGrid2}>
            <OnchainCard title="All-time rewards" value={`$${formatUSDC(data.reward_summary.all_time_usdc)}`} />
            <OnchainCard title="Earning weeks" value={formatInt(data.reward_summary.total_weeks_earned)} />
            <OnchainCard
              title={data.reward_summary.latest_week_label || "Current week"}
              value={`$${formatUSDC(data.reward_summary.latest_week_usdc)}`}
              sub="Current week"
            />
            <OnchainCard
              title={data.reward_summary.previous_week_label || "Previous week"}
              value={`$${formatUSDC(data.reward_summary.previous_week_usdc)}`}
              sub="Previous week"
            />
          </div>

          <SectionTitle>Weekly reward wins</SectionTitle>
          {historyNewestFirst.length === 0 ? (
            <div className="card card-pad" style={{ color: "#6B7280" }}>
              No reward weeks found for this address.
            </div>
          ) : (
            <div className="card" style={{ padding: 12 }}>
              <div style={weeksGrid3}>
                {historyNewestFirst.map((w) => (
                  <div key={w.week_start_utc} style={weekCell}>
                    <div style={weekLabel} title={w.week_label}>
                      {`Week ${w.week_number}`}
                    </div>
                    <div style={weekValue}>{`$${formatUSDC(w.usdc)}`}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Social (keep) */}
      {data ? (
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
            </>
          )}
        </div>
      ) : null}

      {/* Support (keep) */}
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

          <div style={{ marginTop: 10 }} className="subtle">
            Builder: {BUILDER_ADDRESS}
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

/* ---------- Styles ---------- */

const headerCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 18,
  boxShadow: "0 10px 30px rgba(10,10,10,0.06)",
  overflow: "hidden",
};

const topRow: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
};

const avatarWrap: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 14,
  overflow: "hidden",
  border: "1px solid rgba(10,10,10,0.12)",
  background: "#FFFFFF",
  flex: "0 0 auto",
};

const avatarImg: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const avatarFallback: React.CSSProperties = {
  width: "100%",
  height: "100%",
  background: "linear-gradient(135deg, rgba(165,210,255,0.7), rgba(0,0,255,0.08))",
};

const nameBlock: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  paddingTop: 2,
};

const nameRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const displayNameStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 950,
  color: "#0A0A0A",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const usernameStyle: React.CSSProperties = {
  marginTop: 2,
  fontSize: 13,
  fontWeight: 950,
  color: "#0000FF",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const fullWidthInfo: React.CSSProperties = {
  marginTop: 10,
};

const statsBlock: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  alignItems: "flex-start",
};

const statsRow: React.CSSProperties = {
  width: "100%",
  display: "flex",
  gap: 10,
  justifyContent: "flex-start",
  flexWrap: "nowrap",
};

const chip: React.CSSProperties = {
  height: 24,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "0 10px",
  borderRadius: 999,
  border: "1px solid rgba(10,10,10,0.10)",
  background: "rgba(165,210,255,0.35)",
  boxShadow: "0 10px 18px rgba(10,10,10,0.03)",
  whiteSpace: "nowrap",
};

const chipLabel: React.CSSProperties = {
  fontSize: 11.5,
  color: "#6B7280",
  fontWeight: 900,
};

const chipValue: React.CSSProperties = {
  fontSize: 13,
  color: "#0A0A0A",
  fontWeight: 950,
};

const baseappBtn: React.CSSProperties = {
  marginTop: 12,
  width: "100%",
  height: 38,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  borderRadius: 14,
  boxShadow: "0 14px 30px rgba(0,0,255,0.16)",
};

const cardsGrid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const onchainCard: React.CSSProperties = {
  borderRadius: 16,
  padding: 14,
  background: "#0000FF",
  border: "1px solid rgba(0,0,0,0.06)",
  boxShadow: "0 16px 34px rgba(0,0,255,0.18)",
  minHeight: 78,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  textAlign: "center",
};

const onchainTitle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 900,
  color: "rgba(255,255,255,0.86)",
  marginBottom: 6,
};

const onchainValue: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 950,
  color: "#FFFFFF",
};

const onchainSub: React.CSSProperties = {
  marginTop: 6,
  fontSize: 11.5,
  fontWeight: 900,
  color: "rgba(255,255,255,0.86)",
};

const weeksGrid3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const weekCell: React.CSSProperties = {
  border: "1px solid rgba(10,10,10,0.12)",
  borderRadius: 14,
  padding: 10,
  background: "#FFFFFF",
  boxShadow: "0 10px 22px rgba(10,10,10,0.04)",
  minWidth: 0,
};

const weekLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 950,
  color: "#0000FF",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const weekValue: React.CSSProperties = {
  marginTop: 6,
  fontSize: 14,
  fontWeight: 950,
  color: "#0A0A0A",
};
