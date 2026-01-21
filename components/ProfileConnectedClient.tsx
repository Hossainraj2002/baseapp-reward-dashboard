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

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function getNumber(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function findFirstAddress(candidates: Array<unknown>): string | null {
  for (const c of candidates) {
    const s = getString(c);
    if (s && /^0x[a-fA-F0-9]{40}$/.test(s)) return s;
  }
  return null;
}

function extractMiniIdentity(context: unknown): MiniIdentity {
  if (!isObject(context)) return { address: null, farcaster: null };

  const user = isObject(context.user) ? context.user : null;
  const viewer = isObject(context.viewer) ? context.viewer : null;
  const interactor = isObject(context.interactor) ? context.interactor : null;

  const addr = findFirstAddress([
    user?.address,
    user?.custodyAddress,
    (isObject(user?.verified_addresses) && isObject(user?.verified_addresses as unknown)) ? (user as any).verified_addresses?.eth_addresses?.[0] : undefined,
    (isObject(user?.verifiedAddresses) && isObject(user?.verifiedAddresses as unknown)) ? (user as any).verifiedAddresses?.ethAddresses?.[0] : undefined,
    viewer?.address,
    (isObject(interactor?.verified_addresses) && isObject(interactor?.verified_addresses as unknown)) ? (interactor as any).verified_addresses?.eth_addresses?.[0] : undefined,
    (isObject(interactor?.verifiedAddresses) && isObject(interactor?.verifiedAddresses as unknown)) ? (interactor as any).verifiedAddresses?.ethAddresses?.[0] : undefined
  ]);

  // Farcaster object can live in different places depending on SDK version.
  const fcCandidate: unknown =
    (isObject(user) && isObject((user as Record<string, unknown>).farcaster) ? (user as Record<string, unknown>).farcaster : undefined) ??
    (isObject(context.farcaster) ? context.farcaster : undefined);

  let farcaster: MiniIdentity['farcaster'] = null;

  if (isObject(fcCandidate)) {
    const fid = getNumber(fcCandidate.fid) ?? getNumber((fcCandidate as Record<string, unknown>).id);
    const username = getString(fcCandidate.username);
    const pfpUrl = getString((fcCandidate as Record<string, unknown>).pfpUrl) ?? getString((fcCandidate as Record<string, unknown>).pfp_url);
    const followers =
      getNumber((fcCandidate as Record<string, unknown>).followers) ??
      getNumber((fcCandidate as Record<string, unknown>).followerCount) ??
      getNumber((fcCandidate as Record<string, unknown>).followers_count);
    const following =
      getNumber((fcCandidate as Record<string, unknown>).following) ??
      getNumber((fcCandidate as Record<string, unknown>).followingCount) ??
      getNumber((fcCandidate as Record<string, unknown>).following_count);

    farcaster = { fid, username, pfpUrl, followers, following };
  }

  return { address: addr, farcaster };
}

export default function ProfileConnectedClient() {
  const { context } = useMiniKit();
  const mini = useMemo(() => extractMiniIdentity(context as unknown), [context]);

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

        // Prefer MiniKit username/pfp when present, else keep dataset mapping.
        const merged: ApiProfile = { ...payload };

        if (mini.farcaster && (mini.farcaster.username || mini.farcaster.pfpUrl || mini.farcaster.fid)) {
          merged.farcaster = {
            fid: Number(mini.farcaster.fid ?? payload.farcaster?.fid ?? 0) || (payload.farcaster?.fid ?? 0),
            username: mini.farcaster.username ?? payload.farcaster?.username ?? 'unknown',
            pfp_url: mini.farcaster.pfpUrl ?? payload.farcaster?.pfp_url ?? null
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
  }, [mini.address, mini.farcaster?.username, mini.farcaster?.pfpUrl, mini.farcaster?.fid]);

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
      key: h.week_start_utc
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
            background: '#FFFFFF'
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
            Open this page inside Base app (Mini App viewer) so we can read your connected wallet automatically.
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
                  fontWeight: 900
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
                No reward history found for this wallet in the indexed dataset.
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

/* UI helpers */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: `2px solid ${DEEP_BLUE}`,
        borderRadius: 18,
        padding: 12,
        background: '#FFFFFF'
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
        background: LIGHT_BLUE
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
        alignItems: 'center'
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
        textAlign: 'center'
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
        textAlign: 'center'
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 900, color: DEEP_BLUE }}>{title}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: '#000000', marginTop: 8 }}>{value}</div>
    </div>
  );
}
