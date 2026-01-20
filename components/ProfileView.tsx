import React from 'react';

type ProfileData = {
  address: string;
  farcaster: null | {
    fid: number;
    username: string;
    pfp_url: string | null;
  };
  reward_summary: {
    all_time_usdc: number;
    latest_week_usdc: number;
    latest_week_start_utc: string;
    latest_week_label: string;
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

function shortAddress(addr: string) {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

export default function ProfileView({ data }: { data: ProfileData }) {
  return (
    <div className="page" style={{ paddingBottom: 28 }}>
      <div style={{ marginBottom: 12 }}>
        <div className="h1">Profile</div>
        <div className="subtle" style={{ marginTop: 6 }}>
          {data.farcaster ? (
            <span>
              @{data.farcaster.username} (FID {data.farcaster.fid})
            </span>
          ) : (
            <span>{shortAddress(data.address)}</span>
          )}
        </div>

        <div style={{ marginTop: 10 }}>
          <a href="/find">Back to Find</a>
        </div>
      </div>

      {/* Reward summary */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <StatCard title="All-time USDC" value={'$' + formatUSDC(data.reward_summary.all_time_usdc)} />
        <StatCard
          title="Latest week USDC"
          value={'$' + formatUSDC(data.reward_summary.latest_week_usdc)}
          subtitle={data.reward_summary.latest_week_label}
        />
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
        <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>
          Created by {data.meta.created_by}
        </div>

        <div className="subtle" style={{ marginBottom: 8 }}>
          Support creator
        </div>

        <div style={{ fontSize: 13, fontWeight: 900, wordBreak: 'break-all' }}>{data.meta.support_address}</div>
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
