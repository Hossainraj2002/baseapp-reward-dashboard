'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMiniKit } from '@coinbase/onchainkit/minikit';
import Link from 'next/link';

const DEEP_BLUE = '#0000FF';
const LIGHT_BLUE = '#A5D2FF';

type ApiProfile = {
  address: string;
  farcaster: null | { fid: number; username: string; pfp_url: string | null };
  reward_summary: {
    all_time_usdc: number;
    total_weeks_earned: number;
    latest_week_usdc: number;
    latest_week_start_utc: string;
    latest_week_label: string;
    previous_week_usdc: number;
    previous_week_start_utc: string | null;
    previous_week_label: string | null;
  };
  reward_history: Array<{
    week_start_utc: string;
    week_label: string;
    week_number: number;
    usdc: number;
  }>;
  meta: { created_by: string; support_address: string };
};

type MiniIdentity = {
  address: string | null;
  farcaster: null | {
    fid?: number;
    username?: string;
    pfpUrl?: string;
    followers?: number;
    following?: number;
  };
};

function formatUSDC(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getPath(root: unknown, path: Array<string | number>): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (!isRecord(cur) && !Array.isArray(cur)) return undefined;

    if (typeof key === 'number') {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[key];
    } else {
      if (!isRecord(cur)) return undefined;
      cur = cur[key];
    }
  }
  return cur;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function isEvmAddress(s: unknown): s is string {
  const v = asString(s);
  return !!v && /^0x[a-fA-F0-9]{40}$/.test(v);
}

function firstAddress(candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (isEvmAddress(c)) return c;
  }
  return null;
}

function extractMiniIdentity(context: unknown): MiniIdentity {
  const address = firstAddress([
    getPath(context, ['user', 'address']),
    getPath(context, ['user', 'custodyAddress']),
    getPath(context, ['user', 'custody_address']),
    getPath(context, ['user', 'verified_addresses', 'eth_addresses', 0]),
    getPath(context, ['user', 'verifiedAddresses', 'ethAddresses', 0]),
    getPath(context, ['viewer', 'address']),
    getPath(context, ['interactor', 'verified_addresses', 'eth_addresses', 0]),
    getPath(context, ['interactor', 'verifiedAddresses', 'ethAddresses', 0]),
  ]);

  const fcObj =
    getPath(context, ['user', 'farcaster']) ??
    getPath(context, ['farcaster']) ??
    undefined;

  let farcaster: MiniIdentity['farcaster'] = null;

  if (isRecord(fcObj)) {
    const fid = asNumber(fcObj.fid) ?? asNumber(fcObj.id);
    const username = asString(fcObj.username);
    const pfpUrl = asString(fcObj.pfpUrl) ?? asString(fcObj.pfp_url) ?? asString(fcObj.pfp);

    const followers =
      asNumber(fcObj.followers) ??
      asNumber(fcObj.followerCount) ??
      asNumber(fcObj.followers_count);

    const following =
      asNumber(fcObj.following) ??
      asNumber(fcObj.followingCount) ??
      asNumber(fcObj.following_count);

    farcaster = { fid, username, pfpUrl, followers, following };
  }

  return { address, farcaster };
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: `2px solid ${DEEP_BLUE}`,
        borderRadius: 18,
        padding: 12,
        background: '#FFFFFF',
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginTop: 14, marginBottom: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: '#000000' }}>{title}</div>
      {subtitle ? (
        <div style={{ fontSize: 12, opacity: 0.8, color: '#000000', marginTop: 3 }}>{subtitle}</div>
      ) : null}
    </div>
  );
}

function SummaryCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div
      style={{
        border: `2px solid ${DEEP_BLUE}`,
        borderRadius: 16,
        padding: 12,
        background: LIGHT_BLUE,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, color: DEEP_BLUE, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: DEEP_BLUE, lineHeight: 1.1 }}>{value}</div>
      {subtitle ? (
        <div style={{ fontSize: 12, fontWeight: 900, color: DEEP_BLUE, opacity: 0.9, marginTop: 6 }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        border: `2px solid ${DEEP_BLUE}`,
        borderRadius: 999,
        padding: '6px 10px',
        background: '#FFFFFF',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 900, color: DEEP_BLUE }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 900, color: '#000000' }}>{value}</div>
    </div>
  );
}

function MiniWeekCard({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        border: `2px solid ${DEEP_BLUE}`,
        borderRadius: 16,
        padding: 10,
        background: '#FFFFFF',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 900, color: DEEP_BLUE }}>{title}</div>
      <div style={{ fontSize: 14, fontWeight: 900, color: '#000000', marginTop: 6 }}>{value}</div>
    </div>
  );
}

function MiniStat({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        border: `2px solid ${DEEP_BLUE}`,
        borderRadius: 16,
        padding: 12,
        background: '#FFFFFF',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 900, color: DEEP_BLUE }}>{title}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: '#000000', marginTop: 8 }}>{value}</div>
    </div>
  );
}

export default function ProfileConnectedClient() {
  const { context } = useMiniKit();

  const mini = useMemo(() => extractMiniIdentity(context as unknown), [context]);

  const miniFid = mini.farcaster?.fid ?? null;
  const miniUsername = mini.farcaster?.username ?? null;
  const miniPfp = mini.farcaster?.pfpUrl ?? null;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiProfile | null>(null);

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
        const merged: ApiProfile = { ...payload };

        if (miniUsername || miniPfp || miniFid) {
          merged.farcaster = {
            fid: Number(miniFid ?? payload.farcaster?.fid ?? 0) || (payload.farcaster?.fid ?? 0),
            username: miniUsername ?? payload.farcaster?.username ?? 'unknown',
            pfp_url: miniPfp ?? payload.farcaster?.pfp_url ?? null,
          };
        }

        if (!cancelled) setData(merged);
      } catch (e: unknown) {
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
  }, [mini.address, miniFid, miniUsername, miniPfp]);

  const header = useMemo(() => {
    if (!data) return null;

    const title = data.farcaster?.username ? data.farcaster.username : shortAddress(data.address);
    const usernameLine = data.farcaster?.username ? `@${data.farcaster.username}` : shortAddress(data.address);
    const pfp = data.farcaster?.pfp_url || null;

    const followers = mini.farcaster?.followers ?? null;
    const following = mini.farcaster?.following ?? null;

    return { title, usernameLine, pfp, followers, following };
  }, [data, mini.farcaster?.followers, mini.farcaster?.following]);

  const earnedWeeksGrid = useMemo(() => {
    if (!data?.reward_history?.length) return [];
    const items = data.reward_history.map((h) => ({
      label: `Week ${h.week_number}`,
      value: `$${formatUSDC(h.usdc)}`,
      key: h.week_start_utc,
    }));

    const rows: Array<typeof items> = [];
    for (let i = 0; i < items.length; i += 3) rows.push(items.slice(i, i + 3));
    return rows;
  }, [data]);

  return (
    <div style={{ paddingBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#000000' }}>Profile</div>
        <Link
          href="/find"
          style={{
            textDecoration: 'none',
            fontWeight: 900,
            color: DEEP_BLUE,
            border: `2px solid ${DEEP_BLUE}`,
            borderRadius: 999,
            padding: '8px 10px',
            background: '#FFFFFF',
          }}
        >
          Find
        </Link>
      </div>

      {!mini.address ? (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#000000', marginBottom: 6 }}>
            No connected wallet found
          </div>
          <div style={{ fontSize: 13, color: '#000000', opacity: 0.85 }}>
            Open inside Base app so we can read your connected wallet automatically.
          </div>
        </Card>
      ) : loading ? (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#000000' }}>Loading your profile…</div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6, color: '#000000' }}>
            {shortAddress(mini.address)}
          </div>
        </Card>
      ) : err ? (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#000000', marginBottom: 6 }}>
            Failed to load profile
          </div>
          <div style={{ fontSize: 13, color: '#000000', opacity: 0.85 }}>{err}</div>
        </Card>
      ) : !data || !header ? (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#000000' }}>No data found</div>
        </Card>
      ) : (
        <>
          <Card>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 16,
                  overflow: 'hidden',
                  background: DEEP_BLUE,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                  fontWeight: 900,
                }}
              >
                {header.pfp ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={header.pfp} alt="pfp" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  header.title.slice(0, 1).toUpperCase()
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#000000', lineHeight: 1.1 }}>
                  {header.title}
                </div>
                <div style={{ fontSize: 12, opacity: 0.85, color: '#000000', marginTop: 4 }}>
                  {header.usernameLine}
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  <Pill label="Followers" value={header.followers ?? '—'} />
                  <Pill label="Following" value={header.following ?? '—'} />
                </div>
              </div>
            </div>
          </Card>

          <SectionTitle title="Onchain rewards" subtitle="Auto-updates when a new reward week is indexed" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <SummaryCard title="All-time USDC" value={`$${formatUSDC(data.reward_summary.all_time_usdc)}`} />
            <SummaryCard title="Weeks earned" value={`${data.reward_summary.total_weeks_earned}`} />
            <SummaryCard
              title="Current week"
              value={`$${formatUSDC(data.reward_summary.latest_week_usdc)}`}
              subtitle={data.reward_summary.latest_week_label}
            />
            <SummaryCard
              title="Previous week"
              value={`$${formatUSDC(data.reward_summary.previous_week_usdc)}`}
              subtitle={data.reward_summary.previous_week_label ?? '—'}
            />
          </div>

          <SectionTitle title="Winning weeks" subtitle="Only weeks where you earned rewards are shown" />

          {earnedWeeksGrid.length === 0 ? (
            <Card>
              <div style={{ fontSize: 13, opacity: 0.85, color: '#000000' }}>
                No reward history found for this wallet.
              </div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {earnedWeeksGrid.map((row, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {row.map((item) => (
                    <MiniWeekCard key={item.key} title={item.label} value={item.value} />
                  ))}
                  {row.length < 3
                    ? Array.from({ length: 3 - row.length }).map((_, i) => <div key={`pad-${i}`} />)
                    : null}
                </div>
              ))}
            </div>
          )}

          <SectionTitle title="Social engagement" subtitle="Phase 2: Farcaster stats for latest reward week window" />

          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <MiniStat title="Casts" value="—" />
              <MiniStat title="Recasts" value="—" />
              <MiniStat title="Likes" value="—" />
              <MiniStat title="Replies" value="—" />
            </div>
          </Card>

          <div style={{ marginTop: 14 }}>
            <Card>
              <div style={{ fontSize: 13, color: '#000000', marginBottom: 8 }}>
                created by <span style={{ fontWeight: 900 }}>{data.meta.created_by}</span>
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, color: '#000000', marginBottom: 6 }}>Support creator</div>
              <div style={{ fontSize: 13, fontWeight: 900, wordBreak: 'break-all', color: '#000000' }}>
                {data.meta.support_address}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
