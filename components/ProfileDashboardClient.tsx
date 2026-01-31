'use client';

import React, { useEffect, useMemo, useState } from 'react';

import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
  WalletDropdownLink,
  WalletDropdownOpenWallet,
} from '@coinbase/onchainkit/wallet';
import { useMiniKit } from '@coinbase/onchainkit/minikit';
import { isAddress, parseEther, parseUnits } from 'viem';
import { useAccount, useSendTransaction, useWriteContract } from 'wagmi';

import { getOverview } from '@/lib/dataFiles';

const SUPPORT_CREATOR_ADDRESS = '0xd4a1D777e2882487d47c96bc23A47CeaB4f4f18A';
const BASEAPP_APP_URL = 'https://base.app/app/baseapp-reward-dashboard.vercel.app';
const BASE_CHAIN_ID = 8453;
const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const ERC20_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

type FarcasterProfile = {
  fid: number;
  username: string;
  display_name: string;
  pfp_url: string | null;
  bio_text: string | null;
  follower_count: number | null;
  following_count: number | null;
  score: number | null;
  neynar_user_score: number | null;
};

type WeeklyWin = {
  week_number: number;
  week_label: string;
  week_start_date: string;
  reward_usdc: string;
};

type ProfileApiResponse = {
  address: string;
  farcaster: FarcasterProfile | null;
  all_time_total_usdc: string;
  all_time_week_count: number;
  current_week?: { week_number: number; week_label: string; reward_usdc: string } | null;
  previous_week?: { week_number: number; week_label: string; reward_usdc: string } | null;
  weekly_wins: WeeklyWin[];
};

type SocialPost = {
  hash: string;
  text: string;
  created_at: string;
  likes: number;
  recasts: number;
  replies: number;
  url?: string;
};

type SocialApiResponse = {
  fid: number;
  window: { start_utc: string; end_utc: string };
  engagement: { casts: number; likes: number; recasts: number; replies: number };
  top_posts: SocialPost[];
};

type SocialBlockState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: SocialApiResponse };

function formatUSDC(usdcString: string): string {
  const n = Number(usdcString);
  if (!Number.isFinite(n)) return usdcString;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function shortAddress(addr: string): string {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function safeNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function buildBaseAppProfileUrl(address: string, username: string | null): string {
  // Base app profiles reliably support:
  // - base name segment when username ends with .base.eth (e.g. akbaronchain.base.eth -> /profile/akbaronchain)
  // - wallet address fallback
  const u = (username || '').trim();
  if (u.toLowerCase().endsWith('.base.eth')) {
    const first = u.split('.')[0];
    if (first) return `https://base.app/profile/${encodeURIComponent(first)}`;
  }
  return `https://base.app/profile/${encodeURIComponent(address)}`;
}

function computeLatestWeekStartUtcISO(): string {
  const overview = getOverview();
  // overview.latest_week.week_start_utc e.g. "2026-01-28 00:00"
  const raw = overview.latest_week.week_start_utc;
  return raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z';
}

async function fetchProfile(address: string): Promise<ProfileApiResponse> {
  const res = await fetch(`/api/profile?address=${encodeURIComponent(address)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Profile API failed: ${res.status}`);
  return (await res.json()) as ProfileApiResponse;
}

async function fetchSocial(fid: number, startIso: string, endIso: string): Promise<SocialApiResponse> {
  const url = new URL('/api/social', window.location.origin);
  url.searchParams.set('fid', String(fid));
  url.searchParams.set('start', startIso);
  url.searchParams.set('end', endIso);

  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Social API failed: ${res.status}`);

  const raw = (await res.json()) as Record<string, unknown>;
  const windowObj = raw.window as { start_utc?: unknown; end_utc?: unknown } | undefined;
  const engagementObj = raw.engagement as
    | { casts?: unknown; likes?: unknown; recasts?: unknown; replies?: unknown }
    | undefined;
  const topPostsRaw = raw.top_posts as unknown;

  const top_posts: SocialPost[] = Array.isArray(topPostsRaw)
    ? topPostsRaw.map((p) => {
        const rec = p as Record<string, unknown>;
        return {
          hash: typeof rec.hash === 'string' ? rec.hash : '',
          text: typeof rec.text === 'string' ? rec.text : '',
          created_at: typeof rec.created_at === 'string' ? rec.created_at : '',
          likes: safeNumber(rec.likes, 0),
          recasts: safeNumber(rec.recasts, 0),
          replies: safeNumber(rec.replies, 0),
          url: typeof rec.url === 'string' ? rec.url : undefined,
        };
      })
    : [];

  return {
    fid,
    window: {
      start_utc: typeof windowObj?.start_utc === 'string' ? windowObj.start_utc : startIso,
      end_utc: typeof windowObj?.end_utc === 'string' ? windowObj.end_utc : endIso,
    },
    engagement: {
      casts: safeNumber(engagementObj?.casts, 0),
      likes: safeNumber(engagementObj?.likes, 0),
      recasts: safeNumber(engagementObj?.recasts, 0),
      replies: safeNumber(engagementObj?.replies, 0),
    },
    top_posts,
  };
}

function windowLabel(startIso: string, endIso: string) {
  const start = startIso.replace('T', ' ').replace('Z', '').slice(0, 10);
  const end = endIso === 'now' ? 'now' : endIso.replace('T', ' ').replace('Z', '').slice(0, 10);
  return `[${start} → ${end}]`;
}

export default function ProfileDashboardClient() {
  const { address: connectedAddress, isConnected, chainId } = useAccount();
  const miniKit = useMiniKit();

  // Use connected wallet first; fallback to MiniKit context (Base app).
  const contextAddress = (miniKit as unknown as { context?: { user?: { custodyAddress?: string } } }).context?.user
    ?.custodyAddress;

  const resolvedAddress = useMemo(() => {
    const a = connectedAddress || contextAddress || '';
    return a && isAddress(a) ? a : '';
  }, [connectedAddress, contextAddress]);

  const [profileState, setProfileState] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'ready'; data: ProfileApiResponse }
  >({ kind: 'idle' });

  // Social blocks
  const [recentSocial, setRecentSocial] = useState<SocialBlockState>({ kind: 'idle' });
  const [lastRewardSocial, setLastRewardSocial] = useState<SocialBlockState>({ kind: 'idle' });

  // Share modal
  const [shareOpen, setShareOpen] = useState(false);

  // Support
  const [ethCustom, setEthCustom] = useState('');
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();

  const latestWeekStartIso = useMemo(() => computeLatestWeekStartUtcISO(), []);

  const lastRewardWindow = useMemo(() => {
    const end = new Date(latestWeekStartIso);
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }, [latestWeekStartIso]);

  const currentWindow = useMemo(() => {
    return { startIso: latestWeekStartIso, endIso: 'now' };
  }, [latestWeekStartIso]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!resolvedAddress) {
        setProfileState({ kind: 'idle' });
        setRecentSocial({ kind: 'idle' });
        setLastRewardSocial({ kind: 'idle' });
        return;
      }

      setProfileState({ kind: 'loading' });
      setRecentSocial({ kind: 'loading' });
      setLastRewardSocial({ kind: 'loading' });

      try {
        const profile = await fetchProfile(resolvedAddress);
        if (cancelled) return;
        setProfileState({ kind: 'ready', data: profile });

        const fid = profile.farcaster?.fid || 0;
        if (fid <= 0) {
          setRecentSocial({ kind: 'error', message: 'Farcaster profile not available for this address.' });
          setLastRewardSocial({ kind: 'error', message: 'Farcaster profile not available for this address.' });
          return;
        }

        // Window A: latest reward week start → now
        try {
          const endIsoNow = new Date().toISOString();
          const a = await fetchSocial(fid, currentWindow.startIso, endIsoNow);
          if (!cancelled) setRecentSocial({ kind: 'ready', data: a });
        } catch (e) {
          if (!cancelled) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            setRecentSocial({ kind: 'error', message: msg });
          }
        }

        // Window B: 7 days before latest reward week start
        try {
          const b = await fetchSocial(fid, lastRewardWindow.startIso, lastRewardWindow.endIso);
          if (!cancelled) setLastRewardSocial({ kind: 'ready', data: b });
        } catch (e) {
          if (!cancelled) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            setLastRewardSocial({ kind: 'error', message: msg });
          }
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setProfileState({ kind: 'error', message: msg });
        setRecentSocial({ kind: 'error', message: msg });
        setLastRewardSocial({ kind: 'error', message: msg });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [resolvedAddress, currentWindow.startIso, lastRewardWindow.startIso, lastRewardWindow.endIso]);

  const canRenderWalletOnly = !resolvedAddress;

  if (canRenderWalletOnly) {
    return (
      <main className="page" style={{ paddingBottom: 28 }}>
        <div className="card card-pad">
          <div style={{ fontSize: 16, fontWeight: 900, color: '#0000FF', marginBottom: 6 }}>Connect wallet</div>
          <div className="subtle" style={{ marginBottom: 12 }}>
            For the best experience, open this mini app inside the Base app. If you are not in Base app, connect your
            wallet below.
          </div>

          {isConnected ? (
            <div className="subtle">Connected wallet detected, but no address was resolved.</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Wallet>
                <ConnectWallet
                  className="pill"
                  style={{
                    height: 30,
                    padding: '0 14px',
                    fontWeight: 900,
                    borderRadius: 999,
                    border: '1px solid rgba(0,0,255,0.35)',
                  }}
                  text="Connect wallet"
                />
                <WalletDropdown>
                  <WalletDropdownLink icon="wallet" href="https://keys.coinbase.com">
                    Wallet
                  </WalletDropdownLink>
                  <WalletDropdownOpenWallet />
                  <WalletDropdownDisconnect />
                </WalletDropdown>
              </Wallet>
              <div className="subtle">(If you open this inside Base app, it loads automatically)</div>
            </div>
          )}
        </div>
      </main>
    );
  }

  // Chain warning for support tx
  const needsChainSwitch = typeof chainId === 'number' && chainId !== BASE_CHAIN_ID;

  const profile = profileState.kind === 'ready' ? profileState.data : null;
  const farcaster = profile?.farcaster || null;

  const displayName = farcaster?.display_name?.trim() || 'User';
  const username = farcaster?.username?.trim() || '';
  const pfpUrl = farcaster?.pfp_url || '';
  const bio = farcaster?.bio_text || '';

  const score = farcaster?.score ?? farcaster?.neynar_user_score ?? null;

  const baseAppProfileUrl = buildBaseAppProfileUrl(resolvedAddress, username || null);

  // Share text
  const shareTextCopy = `I just checked my Baseapp weekly creator rewards dashboard, feeling based 💙\nCheck your statistics at Baseapp Reward Dashboard\n${BASEAPP_APP_URL}`;
  const shareTextBase = `I just checked my Baseapp weekly creator rewards dashboard, feeling based 💙\nCheck your statistics at Baseapp Reward Dashboard`;

  const shareImageUrl = useMemo(() => {
    if (!profile) return '';

    const current = profile.current_week;
    const previous = profile.previous_week;

    const qp = new URLSearchParams();
    qp.set('name', displayName);
    qp.set('addr', resolvedAddress);

    qp.set('allTime', String(safeNumber(profile.all_time_total_usdc, 0)));
    qp.set('weeks', String(profile.all_time_week_count));

    if (current) {
      qp.set('latestLabel', `${current.week_label}`);
      qp.set('latestUsdc', String(safeNumber(current.reward_usdc, 0)));
    }
    if (previous) {
      qp.set('prevLabel', `${previous.week_label}`);
      qp.set('prevUsdc', String(safeNumber(previous.reward_usdc, 0)));
    }

    return `${window.location.origin}/api/og?${qp.toString()}`;
  }, [profile, displayName, resolvedAddress]);

  const sharePageUrl = useMemo(() => {
    if (!profile) return '';

    const current = profile.current_week;
    const previous = profile.previous_week;

    const qp = new URLSearchParams();
    qp.set('name', displayName);
    qp.set('addr', resolvedAddress);

    qp.set('allTime', String(safeNumber(profile.all_time_total_usdc, 0)));
    qp.set('weeks', String(profile.all_time_week_count));

    if (current) {
      qp.set('latestLabel', `${current.week_label}`);
      qp.set('latestUsdc', String(safeNumber(current.reward_usdc, 0)));
    }
    if (previous) {
      qp.set('prevLabel', `${previous.week_label}`);
      qp.set('prevUsdc', String(safeNumber(previous.reward_usdc, 0)));
    }

    return `${window.location.origin}/share?${qp.toString()}`;
  }, [profile, displayName, resolvedAddress]);

  async function onCopyText() {
    try {
      await navigator.clipboard.writeText(shareTextCopy);
      alert('Copied!');
    } catch {
      alert('Copy failed on this device. Please select and copy manually.');
    }
  }

  async function onShareOnBase() {
    try {
      const embeds: string[] = [];
      if (sharePageUrl) embeds.push(sharePageUrl);
      embeds.push(BASEAPP_APP_URL);

      await miniKit.actions.composeCast({
        text: shareTextBase,
        embeds,
      });
    } catch {
      window.open(BASEAPP_APP_URL, '_blank', 'noopener,noreferrer');
    }
  }

  function openDownloadModal() {
    if (!shareImageUrl) {
      alert('Share image is not ready yet.');
      return;
    }
    setShareOpen(true);
  }

  async function downloadImage() {
    if (!shareImageUrl) return;
    try {
      const res = await fetch(shareImageUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'baseapp-reward-card.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(shareImageUrl, '_blank', 'noopener,noreferrer');
    }
  }

  // Support actions
  async function sendEthSupport() {
    if (!isConnected) {
      alert('Connect your wallet to support.');
      return;
    }
    if (needsChainSwitch) {
      alert('Please switch your wallet to Base network and try again.');
      return;
    }

    const amt = Number(ethCustom);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert('Enter a valid ETH amount.');
      return;
    }

    const ok = window.confirm(`You are about to send ${amt} ETH to support the builder. Continue?`);
    if (!ok) return;

    await sendTransactionAsync({
      to: SUPPORT_CREATOR_ADDRESS,
      value: parseEther(String(amt)),
    });
  }

  async function sendUsdcSupport(amountUsdc: number) {
    if (!isConnected) {
      alert('Connect your wallet to support.');
      return;
    }
    if (needsChainSwitch) {
      alert('Please switch your wallet to Base network and try again.');
      return;
    }

    const ok = window.confirm(`You are about to send ${amountUsdc} USDC to support the builder. Continue?`);
    if (!ok) return;

    await writeContractAsync({
      address: BASE_USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [SUPPORT_CREATOR_ADDRESS, parseUnits(String(amountUsdc), 6)],
    });
  }

  return (
    <main className="page" style={{ paddingBottom: 28 }}>
      {/* Profile info */}
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pfpUrl || '/logo.png'}
            alt=""
            style={{
              width: 66,
              height: 66,
              borderRadius: 16,
              objectFit: 'cover',
              border: '1px solid rgba(0,0,0,0.08)',
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/logo.png';
            }}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#111827', lineHeight: 1.2 }}>{displayName}</div>
            {username ? (
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 900,
                  color: '#0000FF',
                  marginTop: 4,
                  wordBreak: 'break-word',
                }}
              >
                @{username}
              </div>
            ) : (
              <div style={{ fontSize: 12, fontWeight: 900, color: '#6B7280', marginTop: 4 }}>
                {shortAddress(resolvedAddress)}
              </div>
            )}

            {bio ? <div style={{ marginTop: 8, fontSize: 12, color: '#6B7280', lineHeight: 1.35 }}>{bio}</div> : null}

            {/* compact stats */}
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <StatChip label="Score" value={score != null ? score.toFixed(2) : '—'} />
              <StatChip label="FID" value={farcaster?.fid ? farcaster.fid.toLocaleString() : '—'} />
              <StatChip
                label="Following"
                value={farcaster?.following_count != null ? farcaster.following_count.toLocaleString() : '—'}
              />
              <StatChip
                label="Followers"
                value={farcaster?.follower_count != null ? farcaster.follower_count.toLocaleString() : '—'}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Onchain rewards */}
      {profileState.kind === 'loading' ? <div className="subtle">Loading onchain stats…</div> : null}
      {profileState.kind === 'error' ? (
        <div className="card card-pad" style={{ borderColor: 'rgba(239,68,68,0.35)' }}>
          <div style={{ fontWeight: 900, color: '#EF4444' }}>Could not load profile data</div>
          <div className="subtle" style={{ marginTop: 6 }}>
            {profileState.message}
          </div>
        </div>
      ) : null}

      {profile ? (
        <>
          <SectionTitle title="Onchain rewards" subtitle="Your Base app weekly reward stats" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <KpiCardDeep title="All-time rewards" value={`$${formatUSDC(profile.all_time_total_usdc)}`} />
            <KpiCardDeep title="Earning weeks" value={profile.all_time_week_count.toLocaleString()} />

            <KpiCardDeep
              title={profile.current_week ? profile.current_week.week_label : 'Current week'}
              value={`$${formatUSDC(profile.current_week?.reward_usdc || '0')}`}
              subtitle="Current week"
            />
            <KpiCardDeep
              title={profile.previous_week ? profile.previous_week.week_label : 'Previous week'}
              value={`$${formatUSDC(profile.previous_week?.reward_usdc || '0')}`}
              subtitle="Previous week"
            />
          </div>

          <SectionTitle title="Weekly reward wins" subtitle="Only weeks with rewards are shown" />
          <WeeklyWinsGrid wins={profile.weekly_wins} />
        </>
      ) : null}

      {/* Social */}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: '#0000FF' }}>Social</div>
        <div className="subtle" style={{ marginTop: 2 }}>
          Engagement on your Farcaster posts
        </div>

        <SocialBlock
          title="Current social activity"
          subtitle={windowLabel(currentWindow.startIso, currentWindow.endIso)}
          state={recentSocial}
          showTopPosts={false}
        />

        <SocialBlock
          title="Social activity of last reward window"
          subtitle={windowLabel(lastRewardWindow.startIso, lastRewardWindow.endIso)}
          state={lastRewardSocial}
          showTopPosts={true}
        />

        {(recentSocial.kind === 'error' || lastRewardSocial.kind === 'error') && (
          <div className="card card-pad" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, color: '#111827' }}>Social section unavailable</div>
            <div className="subtle" style={{ marginTop: 6 }}>
              Sorry — I’ve run out of Neynar API credits, so the social section is temporarily unavailable. If I get
              support from the Base team to cover API costs, this section will go live again.
            </div>
          </div>
        )}
      </div>

      {/* Share */}
      <div style={{ marginTop: 18 }}>
        <SectionTitle title="Share your stats" subtitle="Generate a shareable card + post text" />

        <div className="card card-pad">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <ActionButton onClick={openDownloadModal}>Download image</ActionButton>
            <ActionButton onClick={onCopyText}>Copy text</ActionButton>
            <ActionButton onClick={onShareOnBase}>Share on Baseapp</ActionButton>
          </div>

          <div className="subtle" style={{ marginTop: 10, lineHeight: 1.4 }}>
            Tip: “Share on Baseapp” opens the Base app composer. If it’s not available, copy the text and post manually.
          </div>

          {shareImageUrl ? (
            <div
              style={{
                marginTop: 12,
                borderRadius: 18,
                overflow: 'hidden',
                border: '1px solid rgba(10,10,10,0.10)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shareImageUrl} alt="Share preview" style={{ width: '100%', display: 'block' }} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Support via onchain tx */}
      <div style={{ marginTop: 18 }}>
        <SectionTitle title="Support the builder" subtitle="Optional — send USDC presets or custom ETH" />

        <div className="card card-pad">
          {needsChainSwitch ? (
            <div style={{ marginBottom: 10, fontWeight: 900, color: '#EF4444' }}>
              Your wallet is not on Base. Switch to Base network before sending.
            </div>
          ) : null}

          <div style={{ fontSize: 12, fontWeight: 900, color: '#6B7280', marginBottom: 8 }}>USDC presets</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[0.5, 1, 2, 5, 10].map((amt) => (
              <ActionButtonSmall key={amt} onClick={() => void sendUsdcSupport(amt)}>
                {amt} USDC
              </ActionButtonSmall>
            ))}
          </div>

          <div style={{ height: 14 }} />

          <div style={{ fontSize: 12, fontWeight: 900, color: '#6B7280', marginBottom: 8 }}>Custom ETH</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={ethCustom}
              onChange={(e) => setEthCustom(e.target.value)}
              placeholder="Amount ETH"
              inputMode="decimal"
              style={inputStyle}
            />
            <ActionButtonSmall onClick={() => void sendEthSupport()}>Send ETH</ActionButtonSmall>
          </div>

          <div className="subtle" style={{ marginTop: 10 }}>
            Destination: {SUPPORT_CREATOR_ADDRESS}
          </div>
        </div>
      </div>

      {/* Footer credit/support */}
      <div style={{ marginTop: 18 }}>
        <div className="card card-pad">
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 10 }}>
            created by 🅰️kbar |{' '}
            <a href="https://x.com/akbarX402" target="_blank" rel="noreferrer">
              x
            </a>{' '}
            |{' '}
            <a href={baseAppProfileUrl} target="_blank" rel="noreferrer">
              baseapp
            </a>
          </div>

          <div style={{ fontSize: 12, fontWeight: 900, color: '#0A0A0A', wordBreak: 'break-all' }}>
            {SUPPORT_CREATOR_ADDRESS}
          </div>
        </div>
      </div>

      {/* Share modal */}
      {shareOpen ? (
        <div style={modalOverlay}>
          <div style={modalCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#111827' }}>Download image</div>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                style={{ border: 'none', background: 'transparent', fontSize: 18, fontWeight: 900, cursor: 'pointer' }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {shareImageUrl ? (
              <div
                style={{
                  marginTop: 12,
                  borderRadius: 16,
                  overflow: 'hidden',
                  border: '1px solid rgba(10,10,10,0.10)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shareImageUrl} alt="Share" style={{ width: '100%', display: 'block' }} />
              </div>
            ) : null}

            <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
              <ActionButton onClick={() => void downloadImage()}>Download</ActionButton>
              <ActionButton onClick={() => window.open(shareImageUrl, '_blank', 'noopener,noreferrer')}>Open image</ActionButton>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginTop: 6, marginBottom: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: '#0000FF' }}>{title}</div>
      {subtitle ? (
        <div className="subtle" style={{ marginTop: 2 }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 26,
        padding: '0 12px',
        borderRadius: 999,
        background: '#EAF2FF',
        border: '1px solid rgba(0,0,255,0.20)',
        color: '#0A0A0A',
        fontSize: 12,
        fontWeight: 900,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: '#6B7280', fontWeight: 900 }}>{label}:</span>
      <span>{value}</span>
    </div>
  );
}

function KpiCardDeep({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div
      style={{
        borderRadius: 14,
        padding: 12,
        background: '#0000FF',
        border: '1px solid rgba(0,0,255,0.35)',
        minHeight: 76,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.95, marginBottom: 6, color: '#FFFFFF', fontWeight: 900 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: '#FFFFFF', lineHeight: 1.1 }}>{value}</div>
      {subtitle ? (
        <div style={{ fontSize: 11, marginTop: 6, color: 'rgba(255,255,255,0.85)', fontWeight: 800 }}>{subtitle}</div>
      ) : null}
    </div>
  );
}

function WeeklyWinsGrid({ wins }: { wins: WeeklyWin[] }) {
  if (!wins || wins.length === 0) {
    return (
      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <div className="subtle">No reward wins found for this address.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
      {wins.map((w) => (
        <div
          key={w.week_number}
          style={{
            border: '1px solid rgba(10,10,10,0.10)',
            borderRadius: 14,
            background: '#FFFFFF',
            padding: 10,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 900, color: '#0000FF' }}>{w.week_label}</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#0A0A0A', marginTop: 8 }}>${formatUSDC(w.reward_usdc)}</div>
        </div>
      ))}
    </div>
  );
}

function SocialBlock({
  title,
  subtitle,
  state,
  showTopPosts,
}: {
  title: string;
  subtitle: string;
  state: SocialBlockState;
  showTopPosts: boolean;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: '#0000FF' }}>{title}</div>
      <div className="subtle" style={{ marginTop: 2 }}>
        {subtitle}
      </div>

      {state.kind === 'loading' ? (
        <div className="subtle" style={{ marginTop: 10 }}>
          Loading social…
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <div className="card card-pad" style={{ marginTop: 10, borderColor: 'rgba(239,68,68,0.35)' }}>
          <div style={{ fontWeight: 900, color: '#EF4444' }}>Failed to load social data</div>
          <div className="subtle" style={{ marginTop: 6 }}>
            {state.message}
          </div>
        </div>
      ) : null}

      {state.kind === 'ready' ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <SocialKpiCard icon="✍️" title="Casts" value={state.data.engagement.casts} />
            <SocialKpiCard icon="🔁" title="Recasts" value={state.data.engagement.recasts} />
            <SocialKpiCard icon="❤️" title="Likes" value={state.data.engagement.likes} />
            <SocialKpiCard icon="💬" title="Replies" value={state.data.engagement.replies} />
          </div>

          {showTopPosts ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#0000FF' }}>Top posts</div>
              <div className="subtle" style={{ marginTop: 2 }}>
                Top 7 posts in this window
              </div>

              <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                {state.data.top_posts.length === 0 ? (
                  <div className="card" style={{ padding: 12, borderRadius: 14 }}>
                    <div className="subtle">No posts found in this timeframe.</div>
                  </div>
                ) : (
                  state.data.top_posts.slice(0, 7).map((p) => (
                    <div
                      key={p.hash}
                      className="card"
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        background: '#FFFFFF',
                        border: '1px solid rgba(10,10,10,0.10)',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 900, color: '#0A0A0A', whiteSpace: 'pre-wrap' }}>
                        {p.text || '(no text)'}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: 12,
                          marginTop: 10,
                          fontSize: 12,
                          color: '#6B7280',
                          fontWeight: 900,
                        }}
                      >
                        <span>❤️ {p.likes}</span>
                        <span>🔁 {p.recasts}</span>
                        <span>💬 {p.replies}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SocialKpiCard({ icon, title, value }: { icon: string; title: string; value: number }) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 14,
        background: '#F6F7FB',
        border: '1px solid rgba(10,10,10,0.10)',
        minHeight: 76,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        boxShadow: '0 10px 26px rgba(0,0,0,0.06)',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          background: '#FFFFFF',
          border: '1px solid rgba(0,0,255,0.14)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
        }}
      >
        {icon}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 900 }}>{title}</div>
        <div style={{ fontSize: 22, color: '#111827', fontWeight: 900, marginTop: 4 }}>{value.toLocaleString()}</div>
      </div>
    </div>
  );
}

function ActionButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 26,
        borderRadius: 999,
        border: '1px solid rgba(0,0,255,0.35)',
        background: '#FFFFFF',
        color: '#0000FF',
        fontWeight: 900,
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function ActionButtonSmall({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 26,
        borderRadius: 999,
        border: '1px solid rgba(0,0,255,0.35)',
        background: '#FFFFFF',
        color: '#0000FF',
        fontWeight: 900,
        fontSize: 12,
        padding: '0 12px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  height: 26,
  borderRadius: 999,
  border: '1px solid rgba(10,10,10,0.12)',
  padding: '0 12px',
  fontSize: 12,
  fontWeight: 900,
  outline: 'none',
  width: 140,
};

const modalOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(17,24,39,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 50,
};

const modalCard: React.CSSProperties = {
  width: 'min(560px, 100%)',
  borderRadius: 18,
  background: '#FFFFFF',
  padding: 14,
  border: '1px solid rgba(10,10,10,0.12)',
};
