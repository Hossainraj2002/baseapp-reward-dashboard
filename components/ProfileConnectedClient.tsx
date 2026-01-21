'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMiniKit } from '@coinbase/onchainkit/minikit';
import { useAccount } from 'wagmi';

type MiniKitContextLite = {
  user?: { fid?: string };
};

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

const DEEP_BLUE = '#0000FF';
const LIGHT_BLUE = '#A5D2FF';

function formatUSDC(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
function safeNumber(x: unknown): number | null {
  const n = typeof x === 'string' ? Number(x) : typeof x === 'number' ? x : NaN;
  return Number.isFinite(n) ? n : null;
}

export default function ProfileConnectedClient() {
  const { context } = useMiniKit();
  const { address } = useAccount();

  const fid = useMemo(() => {
    const ctx = context as unknown as MiniKitContextLite;
    const n = safeNumber(ctx?.user?.fid);
    return n ?? null;
  }, [context]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiProfile | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setErr(null);

      if (!address) {
        setData(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`/api/profile?address=${encodeURIComponent(address)}`);
        if (!res.ok) {
          const j: unknown = await res.json().catch(() => ({}));
          const msg =
            typeof j === 'object' && j && 'error' in j && typeof (j as { error?: unknown }).error === 'string'
              ? (j as { error: string }).error
              : 'Failed to load profile';
          throw new Error(msg);
        }
        const payload = (await res.json()) as ApiProfile;

        // If MiniKit fid exists, we can store it later (Phase 1.5 tracking). For now just keep payload.
        if (!cancelled) setData(payload);
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
  }, [address]);

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

      {!address ? (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#000000', marginBottom: 6 }}>
            No connected wallet detected
          </div>
          <div style={{ fontSize: 13, color: '#000000', opacity: 0.85 }}>
            Open inside Base app. If it still shows this, your OnchainKit API key or MiniKit init is missing.
          </div>
        </Card>
      ) : loading ? (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#000000' }}>Loading…</div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6, color: '#000000' }}>{shortAddress(address)}</div>
        </Card>
      ) : err ? (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#000000', marginBottom: 6 }}>Failed to load</div>
          <div style={{ fontSize: 13, color: '#000000', opacity: 0.85 }}>{err}</div>
        </Card>
      ) : !data ? (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#000000' }}>No data</div>
        </Card>
      ) : (
        <>
          <Card>
            <div style={{ fontSize: 12, opacity: 0.8, color: '#000000' }}>Wallet</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#000000' }}>{shortAddress(data.address)}</div>
            <div style={{ fontSize: 12, opacity: 0.8, color: '#000000', marginTop: 6 }}>
              Farcaster fid: {fid ?? '—'}
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
                  {row.length < 3 ? Array.from({ length: 3 - row.length }).map((_, i) => <div key={`pad-${i}`} />) : null}
                </div>
              ))}
            </div>
          )}

          <SectionTitle title="Social engagement" subtitle="Phase 2: fetch stats for latest reward week window" />
          <Card>
            <div style={{ fontSize: 13, color: '#000000', opacity: 0.85 }}>
              Coming next (casts / recasts / likes / replies + top 7 posts).
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ border: `2px solid ${DEEP_BLUE}`, borderRadius: 18, padding: 12, background: '#FFFFFF' }}>
      {children}
    </div>
  );
}
function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginTop: 14, marginBottom: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: '#000000' }}>{title}</div>
      {subtitle ? <div style={{ fontSize: 12, opacity: 0.8, color: '#000000', marginTop: 3 }}>{subtitle}</div> : null}
    </div>
  );
}
function SummaryCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div style={{ border: `2px solid ${DEEP_BLUE}`, borderRadius: 16, padding: 12, background: LIGHT_BLUE }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: DEEP_BLUE, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: DEEP_BLUE, lineHeight: 1.1 }}>{value}</div>
      {subtitle ? <div style={{ fontSize: 12, fontWeight: 900, color: DEEP_BLUE, marginTop: 6 }}>{subtitle}</div> : null}
    </div>
  );
}
function MiniWeekCard({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ border: `2px solid ${DEEP_BLUE}`, borderRadius: 16, padding: 10, background: '#FFFFFF', textAlign: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 900, color: DEEP_BLUE }}>{title}</div>
      <div style={{ fontSize: 14, fontWeight: 900, color: '#000000', marginTop: 6 }}>{value}</div>
    </div>
  );
}
