'use client';

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

type SocialMetrics = {
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

  const [socialCurrent, setSocialCurrent] = useState<SocialMetrics | null>(null);
  const [socialLastWindow, setSocialLastWindow] = useState<SocialMetrics | null>(null);
  const [socialErr, setSocialErr] = useState<string | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);

  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [copyOk, setCopyOk] = useState(false);

  // Support tx state
  const [supportMode, setSupportMode] = useState<'usdc' | 'eth'>('usdc');
  const [customEth, setCustomEth] = useState('0.001');
  const [supportStatus, setSupportStatus] = useState<string | null>(null);

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
    miniappSdk.context
      .then((ctx: unknown) => {
        setIsMiniApp(true);

        const user = get(ctx, 'user');
        const client = get(ctx, 'client');

        const fidMaybe =
          get(user, 'fid') ??
          get(client, 'fid') ??
          get(client, 'clientFid') ??
          get(get(client, 'farcasterUser'), 'fid');

        if (typeof fidMaybe === 'number' && fidMaybe > 0) setFid(fidMaybe);
      })
      .catch(() => {
        setIsMiniApp(false);
      });
  }, []);

  useEffect(() => {
    if (!address) return;

    let cancelled = false;
    setProfileLoading(true);
    setProfileErr(null);

    fetch(`/api/profile?address=${encodeURIComponent(address)}&resolve=1`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return (await r.json()) as ProfilePayload;
      })
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
      })
      .catch(() => {
        if (cancelled) return;
        setProfile(null);
        setProfileErr('Profile data unavailable right now.');
      })
      .finally(() => {
        if (cancelled) return;
        setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address]);

  useEffect(() => {
    if (!fid || !profile?.reward_summary?.latest_week_start_utc) return;

    const latestStartIso = toUtcStartIso(profile.reward_summary.latest_week_start_utc);
    const lastWindowStart = addDaysIso(latestStartIso, -7);
    const lastWindowEnd = latestStartIso;

    const currentStart = latestStartIso;
    const currentEnd = new Date().toISOString();

    let cancelled = false;
    setSocialLoading(true);
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
      });

    return () => {
      cancelled = true;
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
      // ignore
    }
  }

  async function openDownload() {
    if (!shareParams?.ogImageUrl) return;
    setDownloadOpen(true);
    setDownloadBusy(true);
    setDownloadUrl(null);

    try {
      const r = await fetch(shareParams.ogImageUrl, { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch {
      setDownloadUrl(shareParams.ogImageUrl);
    } finally {
      setDownloadBusy(false);
    }
  }

  function closeDownload() {
    setDownloadOpen(false);
    if (downloadUrl?.startsWith('blob:')) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
  }

  async function shareOnBaseapp() {
    if (!shareParams) return;

    const text = `I just checked my Baseapp weekly creator rewards dashboard, feeling based 💙\n\nCheck your statistics at Baseapp Reward Dashboard`;

    // ✅ FIX #2: embeds must be a tuple, not string[]
    const embeds: [string, string] = [shareParams.sharePageUrl, appUrl];

    try {
      await miniappSdk.actions.composeCast({ text, embeds });
    } catch {
      await copyShareText();
    }
  }

  async function ensureBaseChain() {
    if (chainId === base.id) return true;
    try {
      await switchChainAsync({ chainId: base.id });
      return true;
    } catch {
      return false;
    }
  }

  async function sendUsdc(amountUsd: number) {
    if (!isConnected || !address) return;
    setSupportStatus(null);

    const okChain = await ensureBaseChain();
    if (!okChain) {
      setSupportStatus('Please switch to Base to send support.');
      return;
    }

    // USDC has 6 decimals
    const raw = BigInt(Math.round(amountUsd * 1_000_000));

    try {
      await writeContract.writeContractAsync({
        address: BASE_USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [SUPPORT_BUILDER_ADDRESS, raw],
      });
      setSupportStatus(`Sent $${amountUsd.toFixed(2)} USDC support ✅`);
    } catch {
      setSupportStatus('Transaction failed or rejected.');
    }
  }

  async function sendEthCustom() {
    if (!isConnected || !address) return;
    setSupportStatus(null);

    const okChain = await ensureBaseChain();
    if (!okChain) {
      setSupportStatus('Please switch to Base to send support.');
      return;
    }

    const v = Number(customEth);
    if (!Number.isFinite(v) || v <= 0) {
      setSupportStatus('Enter a valid ETH amount.');
      return;
    }

    try {
      await sendTx.sendTransactionAsync({
        to: SUPPORT_BUILDER_ADDRESS,
        value: parseEther(customEth),
      });
      setSupportStatus(`Sent ${customEth} ETH support ✅`);
    } catch {
      setSupportStatus('Transaction failed or rejected.');
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
          <div className="card card-pad">Loading social…</div>
        ) : socialErr ? (
          <div className="card card-pad" style={{ border: '1px solid rgba(0,0,255,0.25)' }}>
            <div className="subtle">{socialErr}</div>
          </div>
        ) : (
          <>
            {/* Current social activity (no top posts) */}
            {profile ? (
              <div className="card card-pad" style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 900, color: '#0A0A0A' }}>Current social activity</div>
                <div className="subtle" style={{ marginTop: 2 }}>
                  {fmtWindow(toUtcStartIso(profile.reward_summary.latest_week_start_utc), new Date().toISOString())}
                </div>

                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <FloatStat title="Casts" value={socialCurrent?.casts ?? 0} emoji="📝" />
                  <FloatStat title="Likes" value={socialCurrent?.likes ?? 0} emoji="❤️" />
                  <FloatStat title="Recasts" value={socialCurrent?.recasts ?? 0} emoji="🔁" />
                  <FloatStat title="Replies" value={socialCurrent?.replies ?? 0} emoji="💬" />
                </div>
              </div>
            ) : null}

            {/* Last reward window (can include top posts) */}
            {profile ? (
              <div className="card card-pad">
                <div style={{ fontWeight: 900, color: '#0A0A0A' }}>Social activity of last reward window</div>
                <div className="subtle" style={{ marginTop: 2 }}>
                  {fmtWindow(
                    addDaysIso(toUtcStartIso(profile.reward_summary.latest_week_start_utc), -7),
                    toUtcStartIso(profile.reward_summary.latest_week_start_utc)
                  )}
                </div>

                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <FloatStat title="Casts" value={socialLastWindow?.casts ?? 0} emoji="📝" />
                  <FloatStat title="Likes" value={socialLastWindow?.likes ?? 0} emoji="❤️" />
                  <FloatStat title="Recasts" value={socialLastWindow?.recasts ?? 0} emoji="🔁" />
                  <FloatStat title="Replies" value={socialLastWindow?.replies ?? 0} emoji="💬" />
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
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

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

        {downloadOpen ? (
          <div
            style={{
              marginTop: 12,
              border: '1px solid rgba(10,10,10,0.12)',
              borderRadius: 14,
              padding: 10,
              background: '#e4e4e4',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ fontWeight: 900 }}>Share image</div>
              <button className="btn" style={{ height: 26, padding: '0 10px' }} onClick={closeDownload}>
                Close
              </button>
            </div>

            {downloadBusy ? (
              <div className="subtle" style={{ marginTop: 10 }}>
                Preparing image…
              </div>
            ) : downloadUrl ? (
              <div style={{ marginTop: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={downloadUrl} alt="share" style={{ width: '100%', borderRadius: 12 }} />
                <a
                  href={downloadUrl}
                  download="baseapp-reward-dashboard.png"
                  className="btn"
                  style={{ display: 'inline-flex', marginTop: 10, height: 26, padding: '0 10px' }}
                >
                  Download now
                </a>
              </div>
            ) : (
              <div className="subtle" style={{ marginTop: 10 }}>
                Image unavailable.
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Support */}
      <div style={{ marginTop: 14 }} className="card card-pad">
        <div style={{ fontWeight: 900, color: '#0000FF', marginBottom: 8 }}>Support the builder</div>
        <div className="subtle" style={{ marginBottom: 10 }}>
          This sends funds directly from your wallet to the builder address (you will confirm in your wallet).
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button className="btn" style={{ height: 26, padding: '0 10px' }} onClick={() => setSupportMode('usdc')}>
            USDC
          </button>
          <button className="btn" style={{ height: 26, padding: '0 10px' }} onClick={() => setSupportMode('eth')}>
            ETH
          </button>
        </div>

        {supportMode === 'usdc' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 8 }}>
            {[0.5, 1, 2, 5, 10].map((v) => (
              <button
                key={v}
                className="btn"
                style={{ height: 26, padding: '0 10px', fontWeight: 900 }}
                onClick={() => void sendUsdc(v)}
                disabled={isSwitching}
              >
                ${v}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={customEth}
              onChange={(e) => setCustomEth(e.target.value)}
              style={{
                flex: 1,
                border: '1px solid rgba(10,10,10,0.2)',
                borderRadius: 12,
                padding: '8px 10px',
                fontWeight: 800,
              }}
              placeholder="0.001"
            />
            <button
              className="btn"
              style={{ height: 26, padding: '0 10px' }}
              onClick={() => void sendEthCustom()}
              disabled={isSwitching}
            >
              Send
            </button>
          </div>
        )}

        {supportStatus ? (
          <div className="subtle" style={{ marginTop: 10 }}>
            {supportStatus}
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
        <div style={{ fontWeight: 900, color: '#6B7280', fontSize: 12 }}>{title}</div>
      </div>
      <div style={{ marginTop: 8, fontSize: 18, fontWeight: 900, color: '#0A0A0A' }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
