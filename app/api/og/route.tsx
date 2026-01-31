import { ImageResponse } from 'next/og';

export const runtime = 'edge';

function pick(searchParams: URLSearchParams, key: string, fallback = ''): string {
  const v = searchParams.get(key);
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

function pickNum(searchParams: URLSearchParams, key: string, fallback = 0): number {
  const v = Number(searchParams.get(key));
  return Number.isFinite(v) ? v : fallback;
}

function formatUSDC(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function shortAddr(addr: string): string {
  const a = addr.trim();
  if (!a.startsWith('0x') || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // Identity (optional): show name if present, otherwise show short address.
  const name = pick(searchParams, 'name', 'Rewards');
  const addr = pick(searchParams, 'addr', '');
  const identity = addr ? shortAddr(addr) : '';

  // Onchain stats (required)
  const allTime = pickNum(searchParams, 'allTime', 0);
  const weeks = pickNum(searchParams, 'weeks', 0);

  const latestLabel = pick(searchParams, 'latestLabel', 'Latest week');
  const latestUsdc = pickNum(searchParams, 'latestUsdc', 0);

  const prevLabel = pick(searchParams, 'prevLabel', 'Previous week');
  const prevUsdc = pickNum(searchParams, 'prevUsdc', 0);

  const appLink = 'https://base.app/app/baseapp-reward-dashboard.vercel.app';

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: 'flex',
          padding: 44,
          background: 'linear-gradient(135deg, #0000FF 0%, #A5D2FF 100%)',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 46,
            background: 'rgba(255,255,255,0.22)',
            padding: 16,
            display: 'flex',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 40,
              background: '#FFFFFF',
              padding: 34,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 18,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#0000FF', letterSpacing: 0.3 }}>
                  Baseapp Reward Dashboard
                </div>
                <div style={{ marginTop: 8, fontSize: 44, fontWeight: 900, color: '#0B1020', lineHeight: 1.05 }}>
                  {name}
                </div>
                {identity ? (
                  <div style={{ marginTop: 10, fontSize: 18, fontWeight: 900, color: '#6B7280' }}>{identity}</div>
                ) : null}
              </div>

              <div
                style={{
                  width: 280,
                  height: 108,
                  borderRadius: 28,
                  background: '#0000FF',
                  border: '1px solid rgba(0,0,255,0.35)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  padding: 20,
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 900, color: 'rgba(255,255,255,0.90)' }}>All-time rewards</div>
                <div style={{ fontSize: 44, fontWeight: 900, color: '#FFFFFF', marginTop: 8 }}>
                  ${formatUSDC(allTime)}
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div style={{ marginTop: 26, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <div
                style={{
                  width: 520,
                  height: 148,
                  borderRadius: 34,
                  background: 'linear-gradient(135deg, #0B1020 0%, #1D4ED8 100%)',
                  padding: 24,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 900, color: 'rgba(255,255,255,0.86)' }}>Earning weeks</div>
                <div style={{ marginTop: 12, fontSize: 56, fontWeight: 900, color: '#FFFFFF' }}>
                  {weeks.toLocaleString()}
                </div>
              </div>

              <div
                style={{
                  width: 520,
                  height: 148,
                  borderRadius: 34,
                  background: 'linear-gradient(135deg, #0000FF 0%, #3B82F6 100%)',
                  padding: 24,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 900, color: 'rgba(255,255,255,0.90)' }}>{latestLabel}</div>
                <div style={{ marginTop: 12, fontSize: 56, fontWeight: 900, color: '#FFFFFF' }}>
                  ${formatUSDC(latestUsdc)}
                </div>
              </div>

              <div
                style={{
                  width: 520,
                  height: 148,
                  borderRadius: 34,
                  background: '#F4F7FF',
                  border: '1px solid rgba(0,0,255,0.14)',
                  padding: 24,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 900, color: '#6B7280' }}>{prevLabel}</div>
                <div style={{ marginTop: 12, fontSize: 56, fontWeight: 900, color: '#0000FF' }}>
                  ${formatUSDC(prevUsdc)}
                </div>
              </div>

              <div
                style={{
                  width: 520,
                  height: 148,
                  borderRadius: 34,
                  background: '#FFFFFF',
                  border: '1px solid rgba(10,10,10,0.10)',
                  padding: 24,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 900, color: '#6B7280' }}>Check yours on Base</div>
                <div style={{ marginTop: 12, fontSize: 20, fontWeight: 900, color: '#0000FF' }}>{appLink}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
