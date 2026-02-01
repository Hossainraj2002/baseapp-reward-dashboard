"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { sdk as miniappSdk } from '@farcaster/miniapp-sdk';
import { ConnectWallet } from '@coinbase/onchainkit/wallet';
import { useAccount, useSendTransaction, useSwitchChain, useWriteContract } from 'wagmi';
import { base } from 'wagmi/chains';
import { parseEther } from 'viem';

type FarcasterUserProfile = {
  fid: number;
  username: string;
  display_name?: string;
  pfp_url?: string;
  profile?: { bio?: { text?: string } };
  follower_count?: number;
  following_count?: number;
  score?: number;
};

type ProfilePayload = {
  address: string;
  farcaster_user: FarcasterUserProfile | null;
  reward_summary: {
    latest_week_start_utc: string;
    latest_week_label: string;
    all_time_usdc: string;
    earning_weeks: number;
    latest_week_usdc: string;
    prev_week_usdc: string;
    prev_week_label: string;
    change_usdc: string;
    weeks: Array<{ week_start_utc: string; week_label: string; usdc: string }>;
  };
};

type SocialPayload = {
  casts: number;
  likes: number;
  recasts: number;
  replies: number;
  top_posts: Array<{ text: string; likes: number; recasts: number; replies: number }>;
};

const SUPPORT_BUILDER_ADDRESS = '0xd4a1D777e2882487d47c96bc23A47CeaB4f4f18A' as const;

// Base USDC (6 decimals)
const BASE_USDC_ADDRESS = '0x833589fCD6eDB6E08f4c7C32D4f71b54bDA02913' as const;

const ERC20_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'ok', type: 'bool' }],
  },
] as const;

function formatUSDC(usdcString: string) {
  const n = Number(usdcString);
  if (!Number.isFinite(n)) return usdcString;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function toUtcStartIso(yyyyMmDd: string) {
  return `${yyyyMmDd}T00:00:00.000Z`;
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null;
}

function get(v: unknown, key: string): unknown {
  return isObj(v) ? v[key] : undefined;
}

function fmtWindow(startIso: string, endIso: string) {
  const s = startIso.slice(0, 10);
  const e = endIso.slice(0, 10);
  return `[${s} → ${e}]`;
}

function buildShareText(appUrl: string) {
  return `I just checked my Baseapp weekly creator rewards dashboard, feeling based 💙\n\nCheck your statistics at Baseapp Reward Dashboard\n${appUrl}`;
}

function safeTrim(s: string, max = 140) {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export default function ProfileDashboardClient() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();

  const [isMiniApp, setIsMiniApp] = useState(false);
  const [fid, setFid] = useState<number | null>(null);

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

  const writeContract = useWriteContract();
  const sendTx = useSendTransaction();

  const appUrl = useMemo(() => {
    return (
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== 'undefined' ? window.location.origin : 'https://baseapp-reward-dashboard.vercel.app')
    );
  }, []);

  // ✅ FIX #1: sdk.context is a Promise in your version (not a function)
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

    const fetchWindow = async (startIso: string, endIso: string, includeTopPosts: boolean) => {
      const u = new URL('/api/social', window.location.origin);
      u.searchParams.set('fid', String(fid));
      u.searchParams.set('start', startIso);
      u.searchParams.set('end', endIso);
      u.searchParams.set('includeTopPosts', includeTopPosts ? '1' : '0');
      const r = await fetch(u.toString(), { cache: 'no-store' });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as SocialMetrics;
    };

    Promise.all([
      // Current social activity: NO top posts
      fetchWindow(currentStart, currentEnd, false),
      // Last reward window: top posts allowed
      fetchWindow(lastWindowStart, lastWindowEnd, true),
    ])
      .then(([cur, last]) => {
        if (cancelled) return;
        setSocialCurrent(cur);
        setSocialLastWindow(last);
      })
      .catch(() => {
        if (cancelled) return;
        setSocialCurrent(null);
        setSocialLastWindow(null);
        setSocialErr(
          'I’m sorry — the Social section is temporarily unavailable (API quota or network issue). If I receive support from the Base team for API costs, this section will be live again.'
        );
      })
      .finally(() => {
        if (cancelled) return;
        setSocialLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [fid, profile?.reward_summary?.latest_week_start_utc]);

  const shareParams = useMemo(() => {
    if (!profile) return null;

    const origin =
      typeof window === 'undefined' ? 'https://baseapp-reward-dashboard.vercel.app' : window.location.origin;

    const u = new URL('/share', origin);
    const user = profile.farcaster_user;

    if (user?.display_name) u.searchParams.set('name', user.display_name);
    if (user?.username) u.searchParams.set('username', `@${user.username}`);
    if (user?.pfp_url) u.searchParams.set('pfp', user.pfp_url);

    u.searchParams.set('allTime', `$${formatUSDC(profile.reward_summary.all_time_usdc)}`);
    u.searchParams.set('weeks', String(profile.reward_summary.earning_weeks));
    u.searchParams.set('latestLabel', profile.reward_summary.latest_week_label);
    u.searchParams.set('latestUsdc', `$${formatUSDC(profile.reward_summary.latest_week_usdc)}`);

    return {
      sharePageUrl: u.toString(),
      ogImageUrl: new URL(`/api/og?${u.searchParams.toString()}`, u.origin).toString(),
    };
  }, [profile]);

  async function copyShareText() {
    try {
      await navigator.clipboard.writeText(buildShareText(appUrl));
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1200);
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

  if (!isMiniApp) {
    return (
      <div className="page" style={{ paddingBottom: 24 }}>
        <div className="card card-pad" style={{ border: '2px solid #0000FF' }}>
          <div style={{ fontWeight: 900, color: '#0000FF', marginBottom: 8 }}>Open inside Base App</div>
          <div className="subtle" style={{ marginBottom: 12 }}>
            Open this app inside Base as a Mini App to see your profile automatically.
          </div>
          <ConnectWallet />
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ paddingBottom: 24 }}>
      {/* Profile header */}
      <div className="card card-pad" style={{ padding: 12 }}>
        {profileLoading ? (
          <div className="subtle">Loading profile…</div>
        ) : profileErr ? (
          <div className="subtle">{profileErr}</div>
        ) : profile ? (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                overflow: 'hidden',
                background: '#e4e4e4',
                border: '1px solid rgba(0,0,255,0.25)',
                flexShrink: 0,
              }}
            >
              {profile.farcaster_user?.pfp_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.farcaster_user.pfp_url}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : null}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 16, color: '#0A0A0A' }}>
                {profile.farcaster_user?.display_name || profile.farcaster_user?.username || 'User'}
              </div>
              <div style={{ marginTop: 2, fontWeight: 900, color: '#0000FF' }}>
                {profile.farcaster_user?.username ? `@${profile.farcaster_user.username}` : ''}
              </div>
              <div className="subtle" style={{ marginTop: 6 }}>
                {safeTrim(profile.farcaster_user?.profile?.bio?.text || '', 140)}
              </div>

              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Pill label="Score" value={(profile.farcaster_user?.score ?? 0).toFixed(2)} />
                <Pill label="FID" value={String(profile.farcaster_user?.fid ?? '')} />
                <Pill label="Following" value={String(profile.farcaster_user?.following_count ?? 0)} />
                <Pill label="Followers" value={String(profile.farcaster_user?.follower_count ?? 0)} />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Onchain cards */}
      {profile ? (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <DeepCard title="All-time rewards" value={`$${formatUSDC(profile.reward_summary.all_time_usdc)}`} />
          <DeepCard title="Earning weeks" value={String(profile.reward_summary.earning_weeks)} />
          <DeepCard
            title={profile.reward_summary.latest_week_label}
            value={`$${formatUSDC(profile.reward_summary.latest_week_usdc)}`}
          />
          <DeepCard
            title={profile.reward_summary.prev_week_label}
            value={`$${formatUSDC(profile.reward_summary.prev_week_usdc)}`}
          />
        </div>
      ) : null}

      {/* Social cards */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 900, color: '#0000FF', marginBottom: 8 }}>Social</div>

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

                {socialLastWindow?.top_posts?.length ? (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 900, color: '#0000FF', marginBottom: 8 }}>Top posts</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {socialLastWindow.top_posts.slice(0, 7).map((p, idx) => (
                        <div
                          key={idx}
                          style={{ border: '1px solid rgba(10,10,10,0.08)', borderRadius: 12, padding: 10 }}
                        >
                          <div style={{ fontWeight: 900, color: '#0A0A0A' }}>{safeTrim(p.text, 180)}</div>
                          <div className="subtle" style={{ marginTop: 6 }}>
                            ❤️ {p.likes} · 🔁 {p.recasts} · 💬 {p.replies}
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

      {/* Share */}
      <div style={{ marginTop: 14 }} className="card card-pad">
        <div style={{ fontWeight: 900, color: '#0000FF', marginBottom: 8 }}>Share your stats</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <button className="btn" style={{ height: 48, padding: '0 10px' }} onClick={() => void openDownload()}>
            Download image
          </button>
          <button className="btn" style={{ height: 48, padding: '0 10px' }} onClick={() => void copyShareText()}>
            {copyOk ? 'Copied ✅' : 'Copy text'}
          </button>
          <button className="btn" style={{ height: 48, padding: '0 10px' }} onClick={() => void shareOnBaseapp()}>
            Share on Baseapp
          </button>
        </div>

        <div className="card card-pad" style={{ marginTop: 12, background: "rgba(245,248,255,0.92)" }}>
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
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    border: "1px solid rgba(0,0,0,0.12)",
                    padding: "10px 12px",
                    fontWeight: 1000,
                    outline: "none",
                  }}
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
                style={{
                  flex: 1,
                  borderRadius: 14,
                  border: "1px solid rgba(0,0,0,0.12)",
                  padding: "10px 12px",
                  fontWeight: 1000,
                  outline: "none",
                }}
              />
              <div style={{ fontSize: 12, fontWeight: 1000 }}>ETH</div>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <button
              className="btn"
              style={{ height: 26, padding: '0 10px' }}
              onClick={() => void sendEthCustom()}
              disabled={isSwitching}
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
        ) : null}
      </div>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        height: 26,
        borderRadius: 999,
        border: '1px solid rgba(0,0,255,0.25)',
        background: 'rgba(165,210,255,0.26)',
        padding: '0 10px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, color: '#6B7280' }}>{label}:</div>
      <div style={{ fontSize: 12, fontWeight: 900, color: '#0A0A0A' }}>{value}</div>
    </div>
  );
}

function DeepCard({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ borderRadius: 14, padding: 12, background: '#0000FF' }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: '#FFFFFF', opacity: 0.95 }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900, color: '#FFFFFF' }}>{value}</div>
    </div>
  );
}

function FloatStat({ title, value, emoji }: { title: string; value: number; emoji: string }) {
  return (
    <div
      style={{
        borderRadius: 16,
        padding: 12,
        background: 'rgba(165,210,255,0.20)',
        border: '1px solid rgba(0,0,255,0.16)',
        boxShadow: '0 10px 25px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 10,
            background: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 14 }}>{emoji}</span>
        </div>
      </div>
    </div>
  );
                           }
