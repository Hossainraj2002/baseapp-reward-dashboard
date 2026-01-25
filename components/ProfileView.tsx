import React from 'react';
import Link from 'next/link';
import CopyButton from '@/components/CopyButton';
import type { ProfilePayload } from '@/lib/profilePayload';

function formatUSDC(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function ProfileView({ data }: { data: ProfilePayload }) {
  return (
    <div className="page" style={{ paddingBottom: 28 }}>
      <div style={{ marginBottom: 12 }}>
        <div className="h1">Profile</div>

        {/* Full address + copy */}
        <div
          className="card card-pad"
          style={{
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 900, wordBreak: 'break-all' }}>{data.address}</div>
          <CopyButton value={data.address} mode="icon" />
        </div>

        <div style={{ marginTop: 10 }}>
          <Link href="/find">Back to Find</Link>
        </div>
      </div>

      {/* Reward summary: 4 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <StatCard title="All-time USDC" value={'$' + formatUSDC(data.reward_summary.all_time_usdc)} />
        <StatCard title="Weeks earned" value={String(data.reward_summary.total_weeks_earned)} />

        <StatCard
          title="Latest week USDC"
          value={'$' + formatUSDC(data.reward_summary.latest_week_usdc)}
          subtitle={data.reward_summary.latest_week_label}
        />

        <StatCard
          title="Previous week USDC"
          value={'$' + formatUSDC(data.reward_summary.previous_week_usdc)}
          subtitle={data.reward_summary.previous_week_label || '—'}
        />
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>Percent change</div>
        <div style={{ fontSize: 16, fontWeight: 900 }}>
          {data.reward_summary.pct_change == null ? '—' : `${data.reward_summary.pct_change}%`}
        </div>
        <div className="subtle" style={{ marginTop: 6 }}>
          Compared to previous week. If previous week is 0, this shows “—”.
        </div>
      </div>

      {/* Reward history */}
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

      {/* Social stats placeholder */}
      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>Social stats</div>
        <div className="subtle">
          Coming next phase. This section will show follower counts and cast stats when Mini App viewer context is enabled.
        </div>
      </div>

      {/* Support creator */}
      <div className="card card-pad">
        <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>Created by {data.meta.created_by}</div>
        <div className="subtle" style={{ marginBottom: 8 }}>
          Support creator
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 900, wordBreak: 'break-all' }}>
            {data.meta.support_address}
          </div>
          <CopyButton value={data.meta.support_address} mode="icon" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="card" style={{ padding: 12 }}>
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
