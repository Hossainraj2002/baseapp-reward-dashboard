import fs from 'fs';
import path from 'path';

type OverviewJson = {
  latest_week: {
    week_start_utc: string;
    week_end_utc?: string;
  };
};

type WeeklyRow = {
  week_number: number;
  week_label: string;
  week_start_utc: string; // YYYY-MM-DD
  week_end_utc: string;
  total_usdc_amount: number;
  total_unique_users: number;
};

type WeeklyJson = {
  week_keys: string[];
  weeks: WeeklyRow[];
};

type AllTimeRow = {
  address: string;
  total_usdc: string;
  total_weeks_earned?: number;
  weeks: Record<string, string>; // weekKey -> usdc
};

type LeaderboardAllTimeJson = {
  week_keys: string[];
  rows: AllTimeRow[];
};

type FarcasterMapJson = Record<
  string,
  {
    fid: number;
    username: string;
    pfp_url?: string;
  }
>;

export type ProfilePayload = {
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

function readJson<T>(relPath: string): T {
  const p = path.join(process.cwd(), relPath);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

function num(s?: string) {
  const n = Number(s ?? '0');
  return Number.isFinite(n) ? n : 0;
}

export function buildProfilePayload(address: string): ProfilePayload {
  const overview = readJson<OverviewJson>('data/overview.json');
  const weekly = readJson<WeeklyJson>('data/weekly.json');
  const allTime = readJson<LeaderboardAllTimeJson>('data/leaderboard_all_time.json');

  let farcasterMap: FarcasterMapJson = {};
  try {
    farcasterMap = readJson<FarcasterMapJson>('data/farcaster_map.json');
  } catch {
    farcasterMap = {};
  }

  const weekMetaByKey = new Map<string, WeeklyRow>();
  for (const w of weekly.weeks) weekMetaByKey.set(w.week_start_utc, w);

  const user =
    allTime.rows.find((r) => r.address.toLowerCase() === address.toLowerCase()) ?? null;

  const latestWeekKey = overview.latest_week.week_start_utc;
  const latestWeek = weekMetaByKey.get(latestWeekKey) ?? null;

  const prevWeek = latestWeek
    ? weekly.weeks.find((w) => w.week_number === latestWeek.week_number - 1) ?? null
    : null;

  const prevWeekKey = prevWeek?.week_start_utc ?? null;

  const allTimeTotal = user ? num(user.total_usdc) : 0;
  const latestWeekTotal = user ? num(user.weeks?.[latestWeekKey]) : 0;
  const prevWeekTotal = prevWeekKey && user ? num(user.weeks?.[prevWeekKey]) : 0;

  const history: Array<{
    week_start_utc: string;
    week_label: string;
    week_number: number;
    usdc: number;
  }> = [];

  if (user && user.weeks) {
    for (const wk of Object.keys(user.weeks)) {
      const meta = weekMetaByKey.get(wk);
      if (!meta) continue;
      const usdc = num(user.weeks[wk]);
      if (usdc <= 0) continue;
      history.push({
        week_start_utc: wk,
        week_label: meta.week_label,
        week_number: meta.week_number,
        usdc,
      });
    }
  }

  history.sort((a, b) => b.week_number - a.week_number);

  const totalWeeksEarned = user?.total_weeks_earned ?? (user ? history.length : 0);

  const fc = farcasterMap[address.toLowerCase()] || farcasterMap[address] || null;

  return {
    address,
    farcaster: fc
      ? {
          fid: fc.fid,
          username: fc.username,
          pfp_url: fc.pfp_url || null,
        }
      : null,
    reward_summary: {
      all_time_usdc: allTimeTotal,
      total_weeks_earned: totalWeeksEarned,
      latest_week_usdc: latestWeekTotal,
      latest_week_start_utc: latestWeekKey,
      latest_week_label: latestWeek?.week_label || latestWeekKey,
      previous_week_usdc: prevWeekTotal,
      previous_week_start_utc: prevWeekKey,
      previous_week_label: prevWeek?.week_label || null,
    },
    reward_history: history,
    meta: {
      created_by: 'Akbar',
      support_address: '0xd4a1D777e2882487d47c96bc23A47CeaB4f4f18A',
    },
  };
}
