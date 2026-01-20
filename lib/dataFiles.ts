import fs from 'fs';
import path from 'path';

function dataPath(fileName: string) {
  return path.join(process.cwd(), 'data', fileName);
}

function readJsonFile<T>(fileName: string): T {
  const fullPath = dataPath(fileName);

  if (!fs.existsSync(fullPath)) {
    throw new Error(
      `Missing data file: data/${fileName}. Make sure you ran the indexer and the file exists.`
    );
  }

  const raw = fs.readFileSync(fullPath, 'utf8');
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Invalid JSON in data/${fileName}.`);
  }
}

// Types (minimal, only what Home needs)
export type OverviewJson = {
  generated_at_utc: string;
  latest_week: {
    week_start_utc: string;
    week_end_utc: string;
    total_usdc: string;
    unique_users: number;
    breakdown: Array<{ reward_usdc: string; users: number }>;
  };
  all_time: {
    total_usdc: string;
    unique_users: number;
  };
};

export type WeeklyLatestLeaderboardJson = {
  generated_at_utc: string;
  latest_week_start_utc: string;
  latest_week_end_utc: string;
  rows: Array<{
    rank: number;
    address: string;
    user_display: string;
    this_week_usdc: string;
    all_time_usdc: string;
  }>;
};

// Read helpers (server-side only)
export function getOverview(): OverviewJson {
  return readJsonFile<OverviewJson>('overview.json');
}

export function getWeeklyLatestLeaderboard(): WeeklyLatestLeaderboardJson {
  return readJsonFile<WeeklyLatestLeaderboardJson>('leaderboard_weekly_latest.json');
}
