'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMiniKit } from '@coinbase/onchainkit/minikit';
import { useAccount } from 'wagmi';

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

function formatUSDC(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Safe “unknown” helpers (no any)
function getObj(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function getString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function getFirstEthAddressFromContext(ctx: unknown): string | null {
  const o = getObj(ctx);
  if (!o) return null;

  // Try common shapes (best-effort)
  const user = getObj(o.user);
  const viewer = getObj(o.viewer);
  const interactor = getObj(o.interactor);

  const directCandidates = [
    user?.address,
    user?.custodyAddress,
    user?.custody_address,
    viewer?.address,
  ];

  for (const c of directCandidates) {
    const s = getString(c);
    if (s && /^0x[a-fA-F0-9]{40}$/.test(s)) return s;
  }

  // verified_addresses.eth_addresses[0]
  const verified1 = getObj(user?.verified_addresses);
  const eth1 = verified1?.eth_addresses;
  if (Array.isArray(eth1) && typeof eth1[0] === 'string' && /^0x[a-fA-F0-9]{40}$/.test(eth1[0])) {
    return eth1[0];
  }

  // verifiedAddresses.ethAddresses[0]
  const verified2 = getObj(user?.verifiedAddresses);
  const eth2 = verified2?.ethAddresses;
  if (Array.isArray(eth2) && typeof eth2[0] === 'string' && /^0x[a-fA-F0-9]{40}$/.test(eth2[0])) {
    return eth2[0];
  }

  // interactor verified addresses (some runtimes)
  const iv1 = getObj(interactor?.verified_addresses);
  const ieth1 = iv1?.eth_addresses;
  if (Array.isArray(ieth1) && typeof ieth1[0] === 'string' && /^0x[a-fA-F0-9]{40}$/.test(ieth1[0])) {
    return ieth1[0];
  }

  const iv2 = getObj(interactor?.verifiedAddresses);
  const ieth2 = iv2?.ethAddresses;
  if (Array.isArray(ieth2) && typeof ieth2[0] === 'string' && /^0x[a-fA-F0-9]{40}$/.test(ieth2[0])) {
    return ieth2[0];
  }

  return null;
}

export default function ProfileConnectedClient() {
  const { context } = useMiniKit();
  const { address: wagmiAddress, isConnected } = useAccount();

  // Connected address priority:
  // 1) wagmi (most reliable)
  // 2) MiniKit context fallback
  const connectedAddress = useMemo(() => {
    if (wagmiAddress && /^0x[a-fA-F0-9]{40}$/.test(wagmiAddress)) return wagmiAddress;
    return getFirstEthAddressFromContext(context as unknown);
  }, [wagmiAddress, context]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiProfile | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setErr(null);

      if (!connectedAddress) {
        setData(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`/api/profile?address=${encodeURIComponent(connectedAddress)}`);
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j?.error || 'Failed to load profile');
        }
        const payload = (await res.json()) as ApiProfile;
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
  }, [connectedAddress]);

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

      {!connectedAddress ? (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#000000', marginBottom: 6 }}>
            Wallet not detected
          </div>
          <div style={{ fontSize: 13, color: '#000000', opacity: 0.85, marginBottom: 10 }}>
            Open inside Base app so MiniKit + wagmi can read your connected wallet.
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, color: '#000000' }}>
            Debug hint: wagmi connected = <b>{String(isConnected)}</b>
          </div>
        </Card>
      ) : loading ? (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#000000' }}>Loading your profile…</div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6, color: '#000000' }}>
            {shortAddress(connectedAddress)}
          </div>
        </Card>
      ) : err ? (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#000000', marginBottom: 6 }}>
            Failed to load profile
          </div>
          <div style={{ fontSize: 13, color: '#000000', opacity: 0.85 }}>{err}</div>
        </Card>
      ) : !data ? (
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {data.farcaster?.pfp_url ? (
                  <img src={data.farcaster.pfp_url} alt="pfp" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  shortAddress(data.address).slice(0, 1)
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#000000', lineHeight: 1.1 }}>
                  {data.farcaster?.username ?? shortAddress(data.address)}
                </div>
                <div style={{ fontSize: 12, opacity: 0.85, color: '#000000', marginTop: 4 }}>
                  {data.farcaster?.username ? `@${data.farcaster.username}` : shortAddress(data.address)}
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  <Pill label="Followers" value="—" />
                  <Pill label="Following" value="—" />
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
                  {row.length < 3 ? Array.from({ length: 3 - row.length }).map((_, i) => <div key={`pad-${i}`} />) : null}
                </div>
              ))}
            </div>
          )}

          <SectionTitle title="Social engagement" subtitle="Phase 2: Farcaster stats for the latest reward week window" />
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <MiniStat title="Casts" value="—" />
              <MiniStat title="Recasts" value="—" />
              <MiniStat title="Likes" value="—" />
              <MiniStat title="Replies" value="—" />
            </div>
          </Card>

          <SectionTitle title="Top posts" subtitle="Phase 2: top 7 casts of the latest reward week window" />
          <Card>
            <div style={{ fontSize: 13, color: '#000000', opacity: 0.85 }}>
              Coming next.
            </div>
          </Card>

          <SectionTitle title="Share your data" subtitle="Phase 3: generate a shareable image + share/download" />
          <Card>
            <div style={{ fontSize: 13, color: '#000000', opacity: 0.85 }}>
              Coming next.
            </div>
          </Card>

          <div style={{ marginTop: 14 }}>
            <Card>
              <div style={{ fontSize: 13, color: '#000000', marginBottom: 8 }}>
                created by <span style={{ fontWeight: 900 }}>{data.meta.created_by}</span>
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, color: '#000000', marginBottom: 6 }}>
                Support creator
              </div>
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
      {subtitle ? <div style={{ fontSize: 12, fontWeight: 900, color: DEEP_BLUE, opacity: 0.9, marginTop: 6 }}>{subtitle}</div> : null}
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ border: `2px solid ${DEEP_BLUE}`, borderRadius: 999, padding: '6px 10px', background: '#FFFFFF', display: 'flex', gap: 8, alignItems: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 900, color: DEEP_BLUE }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 900, color: '#000000' }}>{value}</div>
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

function MiniStat({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ border: `2px solid ${DEEP_BLUE}`, borderRadius: 16, padding: 12, background: '#FFFFFF', textAlign: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 900, color: DEEP_BLUE }}>{title}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: '#000000', marginTop: 8 }}>{value}</div>
    </div>
  );
}
