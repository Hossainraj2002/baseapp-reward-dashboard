import FrameReady from '@/components/FrameReady';
import CopyButton from '@/components/CopyButton';
import HomeLatestWeekLeaderboardClient from '@/components/HomeLatestWeekLeaderboardClient';
import { getOverview, getWeeklyLatestLeaderboard } from '@/lib/dataFiles';

const SUPPORT_CREATOR_ADDRESS = '0xd4a1D777e2882487d47c96bc23A47CeaB4f4f18A';

function formatUSDC(usdcString: string) {
  const n = Number(usdcString);
  if (!Number.isFinite(n)) return usdcString;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function HomePage() {
  const overview = getOverview();
  const weeklyLatest = getWeeklyLatestLeaderboard();

  // Home Change 1: single-line date
  const lastDistributedOn = overview.latest_week.week_start_utc;

  return (
    <main className="page" style={{ paddingBottom: 28 }}>
      <FrameReady />

      {/* Header with real logo from /public */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <img
          src="/logo.png"
          alt="Baseapp Reward Dashboard logo"
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            objectFit: 'cover',
            border: '1px solid rgba(0,0,255,0.25)',
            background: '#FFFFFF',
          }}
        />
<meta name="base:app_id" content="6970f9825f24b57cc50d3331" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.2, color: '#0000FF' }}>
            Baseapp Reward Dashboard
          </div>

          <div className="subtle" style={{ marginTop: 2 }}>
            Last reward distributed on:{' '}
            <span style={{ fontWeight: 900, color: '#0A0A0A' }}>{lastDistributedOn}</span>
          </div>
        </div>
      </div>

      {/* KPI Cards (deep blue background, numbers/text white bold rule) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <KpiCardDeep title="All-time USDC" value={`$${formatUSDC(overview.all_time.total_usdc)}`} />
        <KpiCardDeep title="All-time users" value={overview.all_time.unique_users.toLocaleString()} />
        <KpiCardDeep title="Latest week USDC" value={`$${formatUSDC(overview.latest_week.total_usdc)}`} />
        <KpiCardDeep title="Latest week users" value={overview.latest_week.unique_users.toLocaleString()} />
      </div>

      {/* Weekly Reward Breakdown (compact, no scrolling, light blue amount pill) */}
      <SectionTitle title="Weekly reward breakdown" subtitle="Latest week distribution buckets" />

      <div
        style={{
          border: '1px solid rgba(10,10,10,0.12)',
          borderRadius: 14,
          background: '#FFFFFF',
          padding: 10,
          marginBottom: 16,
        }}
      >
        {overview.latest_week.breakdown.length === 0 ? (
          <div className="subtle">No breakdown data found for the latest week.</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}
          >
            {overview.latest_week.breakdown.slice(0, 12).map((b, idx) => (
              <div
                key={`${b.reward_usdc}-${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '6px 8px', // compact row
                  border: '1px solid rgba(10,10,10,0.08)',
                  borderRadius: 12,
                  background: '#FFFFFF',
                }}
              >
                <div
                  style={{
                    padding: '4px 8px',
                    borderRadius: 999,
                    background: '#A5D2FF', // amount color = light blue (as requested)
                    color: '#0000FF',
                    fontWeight: 900,
                    fontSize: 12,
                    lineHeight: '14px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ${formatUSDC(b.reward_usdc)}
                </div>

                <div style={{ fontSize: 12, fontWeight: 900, color: '#0A0A0A', whiteSpace: 'nowrap' }}>
                  {b.users.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Latest week leaderboard: match weekly table style + centered + sticky rank/user + controls below */}
      <SectionTitle title="Latest week leaderboard" subtitle="Same layout as weekly page" />

      <HomeLatestWeekLeaderboardClient rows={weeklyLatest.rows} />

      {/* Footer + Support Creator (new credit style + link + copy icon) */}
      <div style={{ marginTop: 16 }}>
        <div className="card card-pad">
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 10 }}>
            created by 🅰️kbar |{' '}
            <a href="https://x.com/akbarX402" target="_blank" rel="noreferrer">
              x
            </a>{' '}
            |{' '}
            <a href="https://base.app/profile/akbaronchain" target="_blank" rel="noreferrer">
              baseapp
            </a>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                flex: 1,
                fontSize: 13,
                fontWeight: 900,
                color: '#0A0A0A',
                wordBreak: 'break-all',
              }}
            >
              {SUPPORT_CREATOR_ADDRESS}
            </div>

            <CopyButton value={SUPPORT_CREATOR_ADDRESS} mode="icon" />
          </div>
        </div>
      </div>
    </main>
  );
}

function KpiCardDeep({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: 14,
        padding: 12,
        background: '#0000FF',
        border: '1px solid rgba(0,0,255,0.35)',
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.95, marginBottom: 6, color: '#FFFFFF', fontWeight: 900 }}>
        {title}
      </div>

      {/* Universal rule: any text/number on deep blue must be white + bold */}
      <div style={{ fontSize: 18, fontWeight: 900, color: '#FFFFFF' }}>{value}</div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginTop: 6, marginBottom: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: '#0000FF' }}>{title}</div>
      {subtitle ? <div className="subtle" style={{ marginTop: 2 }}>{subtitle}</div> : null}
    </div>
  );
}
