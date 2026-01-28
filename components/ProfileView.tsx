import React from 'react';
import Link from 'next/link';
import CopyButton from '@/components/CopyButton';

type ProfileData = {
  address: string;
  farcaster: null | {
    fid: number;
    username: string;
    pfp_url: string | null;
  };
  reward_summary: {
    all_time_usdc: number;
    total_weeks_earned: number;
    latest_week_usdc: number;
    latest_week_start_utc: string;
    latest_week_label: string;
    previous_week_usdc: number;
    previous_week_start_utc: string | null;
    previous_week_label: string | null;
    pct_change: string | null;
  };
  reward_history: Array<{
    week_start_utc: string;
    week_label: string;
    week_number: number;
    usdc: number;
  }>;
  meta: {
    created_by: string;
    support_address: string;
  };
};

function formatUSDC(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function ProfileView({
  data,
  showBackLink = true,
}: {
  data: ProfileData;
  showBackLink?: boolean;
}) {
  return (
    <div className="page" style={{ paddingBottom: 28 }}>
      <div style={{ marginBottom: 12 }}>
        <div className="h1">Profile</div>

        <div className="subtle" style={{ marginTop: 10 }}>
          {data.farcaster ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {data.farcaster.pfp_url ? (
                  <img
                    src={data.farcaster.pfp_url}
                    alt=""
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 999,
                      objectFit: 'cover',
                      border: '1px solid rgba(10,10,10,0.12)',
                      background: '#FFFFFF',
                      flex: '0 0 auto',
                    }}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 999,
                      border: '1px solid rgba(10,10,10,0.12)',
                      background: '#FFFFFF',
                      flex: '0 0 auto',
                    }}
                  />
                )}

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, color: '#0A0A0A', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    @{data.farcaster.username}
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>FID {data.farcaster.fid}</div>
                </div>
              </div>

              <CopyButton value={data.address} mode="icon" />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 900, color: '#0A0A0A', wordBreak: 'break-all' }}>{data.address}</div>
              <CopyButton value={data.address} mode="icon" />
            </div>
          )}
        </div>

        {showBackLink ? (
          <div style={{ marginTop: 10 }}>
            <Link href="/find">Back to Find</Link>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <StatCard title="All-time USDC" value={'$' + formatUSDC(data.reward_summary.all_time_usdc)} />
        <StatCard title="Weeks earned" value={String(data.reward_summary.total_weeks_earned)} />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <StatCard
          title="Latest week"
          value={'$' + formatUSDC(data.reward_summary.latest_week_usdc)}
          subtitle={data.reward_summary.latest_week_label}
        />
        <StatCard
          title="Previous week"
          value={'$' + formatUSDC(data.reward_summary.previous_week_usdc)}
          subtitle={data.reward_summary.previous_week_label || '—'}
        />
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>Percent change</div>
        <div className="subtle">{data.reward_summary.pct_change == null ? '—' : `${data.reward_summary.pct_change}%`}</div>
      </div>

      <div className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
        <div
          style={{
            padding: 12,
            fontSize: 13,
            fontWeight: 900,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          Reward history
        </div>

        {data.reward_history.length === 0 ? (
          <div className="subtle" style={{ padding: 12 }}>
            No rewards found for this address in the indexed data.
          </div>
        ) : (
          <div>
            {data.reward_history.map((r) => (
              <div
                key={r.week_start_utc}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: 12,
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800 }}>{r.week_label}</div>
                <div style={{ fontSize: 13, fontWeight: 900 }}>${formatUSDC(r.usdc)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>Social stats</div>
        <div className="subtle">Coming next phase. This section will show Farcaster stats using FID + Neynar.</div>
      </div>

      <div className="card card-pad">
        <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>Created by {data.meta.created_by}</div>

        <div className="subtle" style={{ marginBottom: 8 }}>
          Support creator
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 900, wordBreak: 'break-all' }}>{data.meta.support_address}</div>
          <CopyButton value={data.meta.support_address} mode="icon" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="card" style={{ flex: 1, padding: 12 }}>
      <div className="subtle" style={{ marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 16, fontWeight: 900 }}>{value}</div>
      {subtitle ? (
        <div className="subtle" style={{ marginTop: 4 }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}
