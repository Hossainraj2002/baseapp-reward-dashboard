import fs from 'fs';
import path from 'path';
import { lookupFarcasterProfileByAddress } from '@/lib/farcasterStore';

type WeeklyJson = {
  weeks: Array<{
    week_number: number;
    week_label: string;
    week_start_utc: string; // "YYYY-MM-DD"
    week_end_utc: string;
    total_usdc_amount: number;
    total_unique_users: number;
  }>;
};

type AllTimeLeaderboardJson = {
  rows: Array<{
    address: string;
    total_usdc: string;
    total_weeks_earned: number;
    weeks?: Record<string, string>;
  }>;
};

type WeeklyLatestLeaderboardJson = {
  latest_week_start_utc: string;
  previous_week_start_utc: string | null;
  rows: Array<{
    address: string;
    this_week_usdc: string;
    previous_week_usdc?: string;
    pct_change?: string | null;
    all_time_usdc: string;
    rank: number;
  }>;
};

export type ProfilePayload = {
  address: string;
  farcaster: null | {
    fid: number;
    username: string;
    display_name: string | null;
    pfp_url: string | null;
    bio_text: string | null;
    follower_count: number | null;
    following_count: number | null;
    score: number | null;
    neynar_user_score: number | null;
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

    pct_change: string | null; // percent string like "12.3"
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

function num(x: unknown): number {
  const n = typeof x === 'string' ? Number(x) : typeof x === 'number' ? x : NaN;
  return Number.isFinite(n) ? n : 0;
}

function readJson<T>(fileRel: string, fallback: T): T {
  try {
    const p = path.join(process.cwd(), 'data', fileRel);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function buildProfilePayload(address: string): ProfilePayload {
  const weekly = readJson<WeeklyJson>('weekly.json', { weeks: [] });
  const allTime = readJson<AllTimeLeaderboardJson>('leaderboard_all_time.json', { rows: [] });
  const weeklyLatest = readJson<WeeklyLatestLeaderboardJson>('leaderboard_weekly_latest.json', {
    latest_week_start_utc: '',
    previous_week_start_utc: null,
    rows: [],
  });

  const addrLower = address.toLowerCase();

  const latestWeekKey = weeklyLatest.latest_week_start_utc || (weekly.weeks.at(-1)?.week_start_utc ?? '');
  const prevWeekKey =
    weeklyLatest.previous_week_start_utc ??
    (weekly.weeks.length >= 2 ? weekly.weeks[weekly.weeks.length - 2].week_start_utc : null);

  const latestWeek = weekly.weeks.find((w) => w.week_start_utc === latestWeekKey) || null;
  const prevWeek = prevWeekKey ? weekly.weeks.find((w) => w.week_start_utc === prevWeekKey) || null : null;

  const userAllTime = allTime.rows.find((r) => r.address.toLowerCase() === addrLower) || null;
  const userLatestRow = weeklyLatest.rows.find((r) => r.address.toLowerCase() === addrLower) || null;

  const allTimeTotal = userAllTime ? num(userAllTime.total_usdc) : 0;

  const latestWeekTotal =
    (userAllTime?.weeks && latestWeekKey && userAllTime.weeks[latestWeekKey] != null
      ? num(userAllTime.weeks[latestWeekKey])
      : userLatestRow
        ? num(userLatestRow.this_week_usdc)
        : 0);

  const prevWeekTotal =
    prevWeekKey && userAllTime?.weeks && userAllTime.weeks[prevWeekKey] != null
      ? num(userAllTime.weeks[prevWeekKey])
      : userLatestRow?.previous_week_usdc != null
        ? num(userLatestRow.previous_week_usdc)
        : 0;

  const totalWeeksEarned =
    userAllTime?.total_weeks_earned ?? (userAllTime?.weeks ? Object.keys(userAllTime.weeks).length : 0);

  const pctChange = prevWeekTotal > 0 ? (((latestWeekTotal - prevWeekTotal) / prevWeekTotal) * 100).toFixed(1) : null;

  const history: ProfilePayload['reward_history'] = [];
  const weeksMap = userAllTime?.weeks || {};

  for (const w of weekly.weeks) {
    const v = weeksMap[w.week_start_utc];
    if (v == null) continue;
    const usdc = num(v);
    if (usdc <= 0) continue;

    history.push({
      week_start_utc: w.week_start_utc,
      week_label: w.week_label,
      week_number: w.week_number,
      usdc,
    });
  }

  history.sort((a, b) => a.week_number - b.week_number);

  // V2: local Farcaster lookup (no runtime Neynar)
  const fc = lookupFarcasterProfileByAddress(address);
  const farcaster =
    fc && fc.username
      ? {
          fid: fc.fid,
          username: fc.username,
          display_name: fc.display_name,
          pfp_url: fc.pfp_url,
          bio_text: fc.bio_text,
          follower_count: fc.follower_count,
          following_count: fc.following_count,
          score: fc.score,
          neynar_user_score: fc.neynar_user_score,
        }
      : null;

  return {
    address,
    farcaster,
    reward_summary: {
      all_time_usdc: allTimeTotal,
      total_weeks_earned: totalWeeksEarned,

      latest_week_usdc: latestWeekTotal,
      latest_week_start_utc: latestWeekKey,
      latest_week_label: latestWeek?.week_label || latestWeekKey,

      previous_week_usdc: prevWeekTotal,
      previous_week_start_utc: prevWeekKey,
      previous_week_label: prevWeek?.week_label || (prevWeekKey ? prevWeekKey : null),

      pct_change: pctChange,
    },
    reward_history: history,
    meta: {
      created_by: '🅰️kbar',
      support_address: '0xd4a1D777e2882487d47c96bc23A47CeaB4f4f18A',
    },
  };
}
