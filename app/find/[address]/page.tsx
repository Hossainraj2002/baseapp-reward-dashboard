import FrameReady from '../../../components/FrameReady';
import ProfileView from '../../../components/ProfileView';
import fs from 'fs';
import path from 'path';
import { getAddress } from 'viem';
import Link from 'next/link';

type OverviewJson = {
  generated_at_utc: string;
  all_time: { total_usdc: string; unique_users: number };
  latest_week: {
    week_start_utc: string;
    week_end_utc: string;
    total_usdc: string;
    unique_users: number;
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

type FarcasterMapJson = Record<
  string,
  {
    fid: number;
    username: string;
    pfp_url?: string;
  }
>;

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function safeChecksumAddress(input: string) {
  try {
    return getAddress(input);
  } catch {
    return null;
  }
}

function isAddressLike(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

function num(s: string) {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export default async function FindAddressPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address: addrRaw } = await params;

  if (!isAddressLike(addrRaw)) {
    return (
      <main style={{ maxWidth: 420, margin: '0 auto', padding: 16 }}>
        <FrameReady />
        <div style={{ fontSize: 16, fontWeight: 900 }}>Invalid address</div>
        <div style={{ marginTop: 8, opacity: 0.75 }}>Address must be formatted like 0x...</div>

        <div style={{ marginTop: 12 }}>
          <Link href="/find">Back to Find</Link>
        </div>
      </main>
    );
  }

  const address = safeChecksumAddress(addrRaw) ?? addrRaw;

  const pOverview = path.join(process.cwd(), 'data', 'overview.json');
  const pWeekly = path.join(process.cwd(), 'data', 'weekly.json');
  const pAllTime = path.join(process.cwd(), 'data', 'leaderboard_all_time.json');
  const pFarcaster = path.join(process.cwd(), 'data', 'farcaster_map.json');

  const overview = readJson<OverviewJson>(pOverview);
  const weekly = readJson<WeeklyJson>(pWeekly);
  const allTime = readJson<LeaderboardAllTimeJson>(pAllTime);

  let farcasterMap: FarcasterMapJson = {};
  try {
    farcasterMap = readJson<FarcasterMapJson>(pFarcaster);
  } catch {
    farcasterMap = {};
  }

  const user = allTime.rows.find((r) => r.address.toLowerCase() === address.toLowerCase()) || null;

  const latestWeekKey = overview.latest_week.week_start_utc;

  const weekMetaByKey = new Map<string, WeeklyRow>();
  for (const w of weekly.weeks) weekMetaByKey.set(w.week_start_utc, w);

  const history: Array<{ week_start_utc: string; week_label: string; week_number: number; usdc: number }> = [];

  if (user && user.weeks) {
    for (const wk of Object.keys(user.weeks)) {
      const meta = weekMetaByKey.get(wk);
      const usdc = num(user.weeks[wk] || '0');
      if (!meta) continue;
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

  const allTimeTotal = user ? num(user.total_usdc) : 0;
  const latestWeekTotal = user ? num(user.weeks?.[latestWeekKey] || '0') : 0;

  const fc = farcasterMap[address.toLowerCase()] || farcasterMap[address] || null;

  const payload = {
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
      latest_week_usdc: latestWeekTotal,
      latest_week_start_utc: latestWeekKey,
      latest_week_label: weekMetaByKey.get(latestWeekKey)?.week_label || latestWeekKey,
    },
    reward_history: history,
    meta: {
      created_by: 'Akbar',
      support_address: '0xd4a1D777e2882487d47c96bc23A47CeaB4f4f18A',
    },
  };

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: 16, paddingBottom: 28 }}>
      <FrameReady />
      <ProfileView data={payload} />
    </main>
  );
}
