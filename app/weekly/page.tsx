import FrameReady from '@/components/FrameReady';
import fs from 'fs';
import path from 'path';
import Link from 'next/link';

type WeeklyRow = {
  week_number: number;
  week_label: string;
  week_start_date_utc: string;
  week_start_utc: string;
  week_end_utc: string;
  total_usdc_amount: number;
  total_unique_users: number;
};

type WeeklyJson = {
  generated_at_utc: string;
  week_keys: string[];
  weeks: WeeklyRow[];
};

function readWeekly(): WeeklyJson {
  const p = path.join(process.cwd(), 'data', 'weekly.json');
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw) as WeeklyJson;
}

function formatUSDC(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const DEEP_BLUE = '#0000FF';

export default function WeeklyOverviewPage() {
  const weekly = readWeekly();
  const rows = [...weekly.weeks].sort((a, b) => b.week_number - a.week_number);

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: 16, paddingBottom: 28 }}>
      <FrameReady />

      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>
          Weekly overview
        </div>

        <div style={{ fontSize: 12, marginTop: 4 }}>
          Tap a week to open its leaderboard.
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          border: `1px solid ${DEEP_BLUE}`,
          borderRadius: 14,
          overflow: 'hidden',
          background: '#ffffff',
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '64px 1fr 96px 72px',
            padding: '8px 10px',
            fontSize: 12,
            fontWeight: 900,
            background: DEEP_BLUE,
            color: '#ffffff',
            textAlign: 'center',
          }}
        >
          <div>Week</div>
          <div>Label</div>
          <div>Total</div>
          <div>Users</div>
        </div>

        {/* Rows */}
        {rows.map((r, idx) => {
          const isBlue = idx % 2 === 0;

          return (
            <Link
              key={r.week_start_utc}
              href={`/weekly/${r.week_start_utc}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '64px 1fr 96px 72px',
                  padding: '8px 10px',
                  alignItems: 'center',
                  background: isBlue ? DEEP_BLUE : '#ffffff',
                  color: isBlue ? '#ffffff' : '#000000',
                  fontSize: 13,
                }}
              >
                {/* Week number */}
                <div style={{ textAlign: 'center', fontWeight: 900 }}>
                  {r.week_number}
                </div>

                {/* Label */}
                <div
                  style={{
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {r.week_label}
                </div>

                {/* Total USDC */}
                <div style={{ textAlign: 'center', fontWeight: 900 }}>
                  ${formatUSDC(r.total_usdc_amount)}
                </div>

                {/* Users */}
                <div style={{ textAlign: 'center', fontWeight: 800 }}>
                  {r.total_unique_users.toLocaleString()}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
