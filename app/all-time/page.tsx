import FrameReady from '../../components/FrameReady';
import AllTimeLeaderboardClient from '../../components/AllTimeLeaderboardClient';
import fs from 'fs';
import path from 'path';

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
  week_keys: string[]; // ordered
  rows: AllTimeRow[];
};

function readAllTime(): LeaderboardAllTimeJson {
  const p = path.join(process.cwd(), 'data', 'leaderboard_all_time.json');
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw) as LeaderboardAllTimeJson;
}

export default function AllTimePage() {
  const allTime = readAllTime();

  // Keep data payload small-ish: only what the client needs
  const payload = {
    generated_at_utc: allTime.generated_at_utc,
    week_keys: allTime.week_keys,
    rows: allTime.rows.map((r) => ({
      all_time_rank: r.all_time_rank,
      address: r.address,
      user_display: r.user_display, // currently short address from indexer
      total_usdc: r.total_usdc,
      total_weeks_earned: r.total_weeks_earned,
      weeks: r.weeks,
    })),
  };

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: 16, paddingBottom: 28 }}>
      <FrameReady />

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>All-time leaderboard</div>
        <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
          Weeks: {allTime.week_keys.length.toLocaleString()} columns
        </div>
      </div>

      <AllTimeLeaderboardClient initialData={payload} />
    </main>
  );
}
