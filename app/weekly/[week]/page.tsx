import FrameReady from '../../../components/FrameReady';
import WeeklyLeaderboardClient from '../../../components/WeeklyLeaderboardClient';
import fs from 'fs';
import path from 'path';
import Link from 'next/link';

type WeeklyRow = {
  week_number: number;
  week_label: string;
  week_start_date_utc: string;
  week_start_utc: string; // YYYY-MM-DD
  week_end_utc: string;
  total_usdc_amount: number;
  total_unique_users: number;
};

type WeeklyJson = {
  generated_at_utc: string;
  week_keys: string[];
  weeks: WeeklyRow[];
};

type AllTimeRow = {
  all_time_rank: number;
  address: string;
  user_display: string;
  total_usdc: string; // decimal string
  total_weeks_earned: number;
  weeks: Record<string, string>; // weekKey -> usdc string
};

type LeaderboardAllTimeJson = {
  generated_at_utc: string;
  week_keys: string[];
  rows: AllTimeRow[];
};

function readWeekly(): WeeklyJson {
  const p = path.join(process.cwd(), 'data', 'weekly.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')) as WeeklyJson;
}

function readAllTime(): LeaderboardAllTimeJson {
  const p = path.join(process.cwd(), 'data', 'leaderboard_all_time.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')) as LeaderboardAllTimeJson;
}

function isWeekKey(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function num(usdc: string) {
  const n = Number(usdc);
  return Number.isFinite(n) ? n : 0;
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function formatUSDC(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const DEEP_BLUE = '#0000FF';

export default function WeeklyDetailPage({ params }: { params: { week: string } }) {
  const weekKey = params.week;

  if (!isWeekKey(weekKey)) {
    return (
      <main style={{ maxWidth: 420, margin: '0 auto', padding: 16 }}>
        <FrameReady />
        <div style={{ fontSize: 16, fontWeight: 900 }}>Invalid week</div>
        <div style={{ marginTop: 8, opacity: 0.75 }}>Week must be formatted like: 2026-01-14</div>
        <div style={{ marginTop: 12 }}>
          <Link href="/weekly" style={{ color: DEEP_BLUE, fontWeight: 900, textDecoration: 'none' }}>
            Back to weekly overview
          </Link>
        </div>
      </main>
    );
  }

  const weekly = readWeekly();
  const allTime = readAllTime();

  const weekRow = weekly.weeks.find((w) => w.week_start_utc === weekKey);

  if (!weekRow) {
    return (
      <main style={{ maxWidth: 420, margin: '0 auto', padding: 16 }}>
        <FrameReady />
        <div style={{ fontSize: 16, fontWeight: 900 }}>Week not found</div>
        <div style={{ marginTop: 8, opacity: 0.75 }}>
          This week key does not exist in data/weekly.json.
        </div>
        <div style={{ marginTop: 12 }}>
          <Link href="/weekly" style={{ color: DEEP_BLUE, fontWeight: 900, textDecoration: 'none' }}>
            Back to weekly overview
          </Link>
        </div>
      </main>
    );
  }

  const prevWeek = weekly.weeks.find((w) => w.week_number === weekRow.week_number - 1);
  const prevWeekKey = prevWeek?.week_start_utc ?? null;

  const rows = allTime.rows
    .map((u) => {
      const thisWeek = num(u.weeks?.[weekKey] ?? '0');
      if (thisWeek <= 0) return null;

      const previousWeek = prevWeekKey ? num(u.weeks?.[prevWeekKey] ?? '0') : 0;
      const allTimeTotal = num(u.total_usdc);

      return {
        address: u.address,
        user_display: shortAddress(u.address),
        this_week: thisWeek,
        previous_week: previousWeek,
        pct_change: pctChange(thisWeek, previousWeek),
        all_time: allTimeTotal,
      };
    })
    .filter(Boolean) as Array<{
    address: string;
    user_display: string;
    this_week: number;
    previous_week: number;
    pct_change: number | null;
    all_time: number;
  }>;

  rows.sort((a, b) => b.this_week - a.this_week);

  const payload = {
    week: {
      week_number: weekRow.week_number,
      week_label: weekRow.week_label,
      week_start_utc: weekRow.week_start_utc,
      week_end_utc: weekRow.week_end_utc,
      total_usdc_amount: weekRow.total_usdc_amount,
      total_unique_users: weekRow.total_unique_users,
      previous_week_start_utc: prevWeekKey,
    },
    rows: rows.map((r, i) => ({
      rank: i + 1,
      address: r.address,
      user_display: r.user_display,
      this_week_usdc: r.this_week,
      previous_week_usdc: r.previous_week,
      pct_change: r.pct_change,
      all_time_usdc: r.all_time,
    })),
  };

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: 16, paddingBottom: 28 }}>
      <FrameReady />

      {/* TOP BLUE CARD (like your marked photo) */}
      <div
        style={{
          borderRadius: 16,
          border: `2px solid ${DEEP_BLUE}`,
          overflow: 'hidden',
          marginBottom: 14,
          background: DEEP_BLUE,
          color: '#ffffff',
        }}
      >
        <div style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.2 }}>{weekRow.week_label}</div>

          <div style={{ marginTop: 6, fontSize: 14, fontWeight: 900, opacity: 0.95 }}>
            {weekRow.week_start_utc} - {weekRow.week_end_utc}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <MiniStatBlue title="Total USDC" value={`$${formatUSDC(weekRow.total_usdc_amount)}`} />
            <MiniStatBlue title="Users" value={weekRow.total_unique_users.toLocaleString()} />
          </div>
        </div>

        <Link
          href="/weekly"
          style={{
            display: 'block',
            textDecoration: 'none',
            background: '#ffffff',
            color: DEEP_BLUE,
            fontWeight: 900,
            textAlign: 'center',
            padding: '14px 12px',
            borderTop: `2px solid ${DEEP_BLUE}`,
          }}
        >
          Back to weekly overview
        </Link>
      </div>

      {/* TABLE */}
      <WeeklyLeaderboardClient initialData={payload} />
    </main>
  );
}

function MiniStatBlue({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        flex: 1,
        borderRadius: 14,
        border: '2px solid rgba(255,255,255,0.55)',
        padding: 12,
        textAlign: 'center',
        background: 'rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.95 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 900, marginTop: 6 }}>{value}</div>
    </div>
  );
}
