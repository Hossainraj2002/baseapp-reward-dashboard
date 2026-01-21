import FrameReady from '../../components/FrameReady';
import CopyIconButton from '../../components/CopyIconButton';
import Link from 'next/link';
import fs from 'fs';
import path from 'path';

const DEEP_BLUE = '#0000FF';
const LIGHT_BLUE = '#A5D2FF';

const SUPPORT_CREATOR_ADDRESS = '0xd4a1D777e2882487d47c96bc23A47CeaB4f4f18A';

type Overview = {
  latest_week: {
    week_start_utc: string;
  };
};

type WeeklyRow = {
  week_number: number;
  week_label: string;
  week_start_utc: string;
  week_end_utc: string;
  total_usdc_amount: number;
  total_unique_users: number;
};

type WeeklyJson = {
  weeks: WeeklyRow[];
};

type AllTimeRow = {
  address: string;
  total_usdc: string;
  weeks: Record<string, string>;
};

type AllTimeJson = {
  week_keys: string[];
  rows: AllTimeRow[];
};

function readJson<T>(relPath: string): T {
  const p = path.join(process.cwd(), relPath);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

function isAddress(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function numStr(s?: string) {
  const n = Number(s ?? '0');
  return Number.isFinite(n) ? n : 0;
}

function formatUSDC(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string }>;
}) {
  const { address: addressRaw } = await searchParams;

  const addressParam = (addressRaw ?? '').trim();
  const address = isAddress(addressParam) ? addressParam : null;

  const overview = readJson<Overview>('data/overview.json');
  const weekly = readJson<WeeklyJson>('data/weekly.json');
  const allTime = readJson<AllTimeJson>('data/leaderboard_all_time.json');

  const latestWeekKey = overview.latest_week.week_start_utc;

  const userRow = address
    ? allTime.rows.find((r) => r.address.toLowerCase() === address.toLowerCase())
    : null;

  const allTimeTotal = userRow ? numStr(userRow.total_usdc) : 0;
  const latestWeekTotal = userRow ? numStr(userRow.weeks?.[latestWeekKey]) : 0;

  const history =
    userRow && weekly.weeks
      ? [...weekly.weeks]
          .sort((a, b) => b.week_number - a.week_number)
          .map((w) => ({
            week_number: w.week_number,
            week_label: w.week_label,
            week_start_utc: w.week_start_utc,
            usdc: numStr(userRow.weeks?.[w.week_start_utc]),
          }))
          .filter((x) => x.usdc > 0)
      : [];

  return (
    <main
      style={{
        maxWidth: 420,
        margin: '0 auto',
        padding: 16,
        paddingBottom: 28,
        background: '#FFFFFF',
      }}
    >
      <FrameReady />

      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#000000' }}>Profile</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4, color: '#000000' }}>
          {address ? (
            <>
              Viewing: <span style={{ fontWeight: 900 }}>{shortAddress(address)}</span>
            </>
          ) : (
            <>Tip: open a wallet profile using Find</>
          )}
        </div>
      </div>

      {/* If no address */}
      {!address ? (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#000000', marginBottom: 6 }}>
            No wallet selected
          </div>
          <div style={{ fontSize: 13, color: '#000000', opacity: 0.85, marginBottom: 12 }}>
            Go to Find, paste a wallet address, then open it.
          </div>

          <Link
            href="/find"
            style={{
              display: 'block',
              textAlign: 'center',
              textDecoration: 'none',
              border: `2px solid ${DEEP_BLUE}`,
              color: DEEP_BLUE,
              background: '#FFFFFF',
              padding: '12px 12px',
              borderRadius: 14,
              fontWeight: 900,
            }}
          >
            Open Find
          </Link>
        </Card>
      ) : (
        <>
          {/* Avatar + summary */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <div
              aria-label="Avatar placeholder"
              style={{
                width: 54,
                height: 54,
                borderRadius: 16,
                background: DEEP_BLUE,
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: 18,
              }}
            >
              {shortAddress(address).slice(2, 3)}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, color: '#000000', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {address}
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, color: '#000000', marginTop: 3 }}>
                If Farcaster mapping exists, we’ll show it here later.
              </div>
            </div>
          </div>

          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <SummaryCard title="All-time USDC" value={`$${formatUSDC(allTimeTotal)}`} />
            <SummaryCard title="Latest week USDC" value={`$${formatUSDC(latestWeekTotal)}`} />
          </div>

          {/* Reward history */}
          <SectionTitle title="Reward history" subtitle="Weeks where this wallet earned rewards" />

          <div style={tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 78 }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 110 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={th}>Week</th>
                  <th style={th}>Label</th>
                  <th style={thRight}>USDC</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ padding: 12, color: '#000000', opacity: 0.8 }}>
                      No rewards found for this wallet in the indexed dataset.
                    </td>
                  </tr>
                ) : (
                  history.map((h) => (
                    <tr key={h.week_start_utc} style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                      <td style={tdCenter}>
                        <span style={{ fontWeight: 900, color: DEEP_BLUE }}>{h.week_number}</span>
                      </td>
                      <td style={tdLeft}>{h.week_label}</td>
                      <td style={tdRight}>${formatUSDC(h.usdc)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Social stats placeholder */}
          <SectionTitle title="Social stats" subtitle="Will populate from MiniKit when enabled" />
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <MiniStat title="Followers" value="-" />
              <MiniStat title="Following" value="-" />
              <MiniStat title="Casts" value="-" />
              <MiniStat title="Likes" value="-" />
              <MiniStat title="Recasts" value="-" />
              <MiniStat title="Replies" value="-" />
            </div>
          </Card>
        </>
      )}

      {/* Creator + Support */}
      <div style={{ marginTop: 14 }}>
        <Card>
          <div style={{ fontSize: 13, color: '#000000', marginBottom: 10 }}>
            created by <span style={{ fontWeight: 900 }}>🅰️kbar</span> |{' '}
            <a href="https://x.com/akbarX402" style={linkStyle} target="_blank" rel="noreferrer">
              x
            </a>{' '}
            |{' '}
            <a href="https://base.app/profile/akbaronchain" style={linkStyle} target="_blank" rel="noreferrer">
              baseapp
            </a>
          </div>

          <div style={{ fontSize: 13, fontWeight: 900, color: '#000000', marginBottom: 8 }}>
            Support creator
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, color: '#000000', opacity: 0.9, wordBreak: 'break-all' }}>
              {SUPPORT_CREATOR_ADDRESS}
            </div>
            <CopyIconButton value={SUPPORT_CREATOR_ADDRESS} />
          </div>
        </Card>
      </div>
    </main>
  );
}

/* ---------- UI pieces ---------- */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: `2px solid ${DEEP_BLUE}`,
        borderRadius: 16,
        padding: 12,
        background: '#FFFFFF',
      }}
    >
      {children}
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        border: `2px solid ${DEEP_BLUE}`,
        borderRadius: 16,
        padding: 12,
        background: LIGHT_BLUE,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, color: DEEP_BLUE, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: DEEP_BLUE }}>{value}</div>
    </div>
  );
}

function MiniStat({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        border: `2px solid ${DEEP_BLUE}`,
        borderRadius: 14,
        padding: 10,
        background: '#FFFFFF',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 900, color: DEEP_BLUE }}>{title}</div>
      <div style={{ fontSize: 14, fontWeight: 900, color: '#000000', marginTop: 6 }}>{value}</div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginTop: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: '#000000' }}>{title}</div>
      {subtitle ? (
        <div style={{ fontSize: 12, opacity: 0.8, color: '#000000', marginTop: 3 }}>{subtitle}</div>
      ) : null}
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  color: DEEP_BLUE,
  fontWeight: 900,
  textDecoration: 'none',
};

const tableWrap: React.CSSProperties = {
  border: `2px solid ${DEEP_BLUE}`,
  borderRadius: 16,
  overflow: 'hidden',
  background: '#FFFFFF',
};

const th: React.CSSProperties = {
  padding: '9px 8px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 900,
  background: DEEP_BLUE,
  color: '#FFFFFF',
};

const thRight: React.CSSProperties = {
  ...th,
  textAlign: 'right',
};

const tdCenter: React.CSSProperties = {
  padding: '9px 8px',
  textAlign: 'center',
  fontSize: 13,
  fontWeight: 900,
  color: '#000000',
};

const tdLeft: React.CSSProperties = {
  padding: '9px 8px',
  textAlign: 'left',
  fontSize: 13,
  fontWeight: 900,
  color: '#000000',
};

const tdRight: React.CSSProperties = {
  padding: '9px 8px',
  textAlign: 'right',
  fontSize: 13,
  fontWeight: 900,
  color: '#000000',
};
