'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMiniKit } from '@coinbase/onchainkit/minikit';
import Link from 'next/link';

type ApiProfile = {
  address: string;
  farcaster: null | { fid: number; username: string; pfp_url: string | null };
  reward_summary: {
    all_time_usdc: number;
    total_weeks_earned: number;
    latest_week_usdc: number;
    latest_week_label: string;
    previous_week_usdc: number;
    previous_week_label: string | null;
  };
  reward_history: Array<{ week_number: number; week_start_utc: string; usdc: number }>;
  meta: { created_by: string; support_address: string };
};

type MiniFarcaster = {
  fid?: number;
  username?: string;
  pfpUrl?: string;
  pfp_url?: string;
  followers?: number;
  following?: number;
  followerCount?: number;
  followingCount?: number;
};

type MiniUser = {
  address?: string;
  custodyAddress?: string;
  custody_address?: string;
  verified_addresses?: { eth_addresses?: string[] };
  verifiedAddresses?: { ethAddresses?: string[] };
  farcaster?: MiniFarcaster;
};

type MiniContext = {
  user?: MiniUser;
  viewer?: MiniUser;
  interactor?: MiniUser;
  farcaster?: MiniFarcaster;
};

function isEvmAddress(x: unknown): x is string {
  return typeof x === 'string' && /^0x[a-fA-F0-9]{40}$/.test(x);
}

function formatUSDC(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function extractMini(ctx: MiniContext | null | undefined): {
  address: string | null;
  farcaster: {
    fid?: number;
    username?: string;
    pfpUrl?: string;
    followers?: number;
    following?: number;
  } | null;
} {
  if (!ctx) return { address: null, farcaster: null };

  const candidates: Array<unknown> = [
    ctx.user?.address,
    ctx.user?.custodyAddress,
    ctx.user?.custody_address,
    ctx.user?.verified_addresses?.eth_addresses?.[0],
    ctx.user?.verifiedAddresses?.ethAddresses?.[0],
    ctx.viewer?.address,
    ctx.viewer?.custodyAddress,
    ctx.viewer?.verified_addresses?.eth_addresses?.[0],
    ctx.interactor?.verified_addresses?.eth_addresses?.[0],
  ];

  const address = candidates.find(isEvmAddress) ?? null;

  const fc = ctx.user?.farcaster ?? ctx.farcaster ?? null;

  const farcaster = fc
    ? {
        fid: fc.fid,
        username: fc.username,
        pfpUrl: fc.pfpUrl ?? fc.pfp_url,
        followers: fc.followers ?? fc.followerCount,
        following: fc.following ?? fc.followingCount,
      }
    : null;

  return { address, farcaster };
}

export default function ProfileConnectedClient() {
  const { context } = useMiniKit();

  const mini = useMemo(() => extractMini(context as unknown as MiniContext), [context]);

  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiProfile | null>(null);

  const depKey = `${mini.address ?? ''}|${mini.farcaster?.fid ?? ''}|${mini.farcaster?.username ?? ''}|${mini.farcaster?.pfpUrl ?? ''}`;

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setErr(null);

      if (!mini.address) {
        setData(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`/api/profile?address=${encodeURIComponent(mini.address)}`);
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || 'Failed to load profile');
        }

        const payload = (await res.json()) as ApiProfile;

        // Prefer MiniKit farcaster info if present
        const merged: ApiProfile = { ...payload };
        if (mini.farcaster?.username || mini.farcaster?.pfpUrl || mini.farcaster?.fid) {
          merged.farcaster = {
            fid: Number(mini.farcaster.fid ?? payload.farcaster?.fid ?? 0) || (payload.farcaster?.fid ?? 0),
            username: mini.farcaster.username ?? payload.farcaster?.username ?? 'unknown',
            pfp_url: mini.farcaster.pfpUrl ?? payload.farcaster?.pfp_url ?? null,
          };
        }

        if (!cancelled) setData(merged);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        if (!cancelled) setErr(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [depKey]);

  if (!mini.address) {
    return (
      <div style={{ padding: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>No connected wallet found</div>
        <div style={{ opacity: 0.8, marginBottom: 10 }}>
          Open inside Base app so the Mini App can read your connected wallet.
        </div>
        <Link href="/find" style={{ fontWeight: 900 }}>
          Use Find instead
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 12 }}>
        <div style={{ fontWeight: 900 }}>Loading…</div>
        <div style={{ opacity: 0.8 }}>{shortAddress(mini.address)}</div>
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ padding: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Failed to load profile</div>
        <div style={{ opacity: 0.8 }}>{err}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 12 }}>
        <div style={{ fontWeight: 900 }}>No data</div>
      </div>
    );
  }

  const title = data.farcaster?.username ? data.farcaster.username : shortAddress(data.address);
  const username = data.farcaster?.username ? `@${data.farcaster.username}` : shortAddress(data.address);
  const pfp = data.farcaster?.pfp_url ?? null;

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            overflow: 'hidden',
            background: '#0000FF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 900,
          }}
        >
          {pfp ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pfp} alt="pfp" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            title.slice(0, 1).toUpperCase()
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
          <div style={{ opacity: 0.75, fontSize: 12 }}>{username}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ border: '2px solid #0000FF', borderRadius: 14, padding: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 12, opacity: 0.8 }}>All-time</div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>${formatUSDC(data.reward_summary.all_time_usdc)}</div>
        </div>
        <div style={{ border: '2px solid #0000FF', borderRadius: 14, padding: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 12, opacity: 0.8 }}>Weeks earned</div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>{data.reward_summary.total_weeks_earned}</div>
        </div>
        <div style={{ border: '2px solid #0000FF', borderRadius: 14, padding: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 12, opacity: 0.8 }}>Current week</div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>${formatUSDC(data.reward_summary.latest_week_usdc)}</div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>{data.reward_summary.latest_week_label}</div>
        </div>
        <div style={{ border: '2px solid #0000FF', borderRadius: 14, padding: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 12, opacity: 0.8 }}>Previous week</div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>${formatUSDC(data.reward_summary.previous_week_usdc)}</div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>{data.reward_summary.previous_week_label ?? '—'}</div>
        </div>
      </div>

      <div style={{ marginTop: 14, opacity: 0.75, fontSize: 12 }}>
        Phase 2 will add social stats + top posts.
      </div>
    </div>
  );
}
