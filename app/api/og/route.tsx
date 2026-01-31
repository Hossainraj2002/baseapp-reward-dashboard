import { ImageResponse } from 'next/og';

export const runtime = 'edge';

function safeText(s: string, max = 80) {
  const cleaned = (s || '').replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const displayName = safeText(searchParams.get('name') || 'Baseapp user', 28);
  const username = safeText(searchParams.get('username') || '', 28);
  const pfp = searchParams.get('pfp') || '';

  const allTime = safeText(searchParams.get('allTime') || '0', 20);
  const earningWeeks = safeText(searchParams.get('weeks') || '0', 20);
  const latestLabel = safeText(searchParams.get('latestLabel') || 'Latest week', 26);
  const latestUsdc = safeText(searchParams.get('latestUsdc') || '0', 20);

  const brand = {
    blue: '#0000FF',
    light: '#A5D2FF',
    ink: '#0A0A0A',
    surface: '#FFFFFF',
  };

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${brand.blue} 0%, #0B2BFF 45%, ${brand.light} 100%)`,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
          padding: 44,
        }}
      >
        <div
          style={{
            flex: 1,
            borderRadius: 36,
            background: 'rgba(255,255,255,0.92)',
            boxShadow: '0 30px 90px rgba(0,0,0,0.25)',
            border: '1px solid rgba(0,0,255,0.20)',
            display: 'flex',
            flexDirection: 'column',
            padding: 40,
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: 24,
                overflow: 'hidden',
                background: brand.surface,
                border: '2px solid rgba(0,0,255,0.20)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {pfp ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pfp} alt="pfp" width={84} height={84} style={{ objectFit: 'cover' }} />
              ) : (
                <div style={{ color: brand.blue, fontWeight: 900, fontSize: 34 }}>A</div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 44, fontWeight: 900, color: brand.ink, lineHeight: 1.05 }}>
                {displayName}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: brand.blue }}>
                {username ? `@${username}` : 'Profile stats'}
              </div>
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: brand.blue }}>Baseapp Reward Dashboard</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'rgba(10,10,10,0.65)' }}>
                Onchain rewards summary
              </div>
            </div>
          </div>

          {/* Cards */}
          <div
            style={{
              display: 'flex',
              gap: 18,
              marginTop: 32,
              flexWrap: 'wrap',
            }}
          >
            <StatCard label="All-time rewards" value={`$${allTime}`} accent={brand.blue} />
            <StatCard label="Earning weeks" value={earningWeeks} accent={brand.blue} />
            <StatCard label={latestLabel} value={`$${latestUsdc}`} accent={brand.blue} wide />
          </div>

          {/* Footer */}
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                padding: '10px 16px',
                borderRadius: 999,
                background: 'rgba(0,0,255,0.08)',
                border: '1px solid rgba(0,0,255,0.16)',
                color: brand.blue,
                fontWeight: 900,
                fontSize: 18,
              }}
            >
              Check yours in Base App
            </div>

            <div style={{ marginLeft: 'auto', color: 'rgba(10,10,10,0.60)', fontSize: 18, fontWeight: 700 }}>
              base.app/app/baseapp-reward-dashboard.vercel.app
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}

function StatCard({
  label,
  value,
  accent,
  wide,
}: {
  label: string;
  value: string;
  accent: string;
  wide?: boolean;
}) {
  return (
    <div
      style={{
        flex: wide ? '1 1 520px' : '1 1 320px',
        minWidth: wide ? 520 : 320,
        borderRadius: 24,
        background: '#FFFFFF',
        border: '1px solid rgba(10,10,10,0.10)',
        padding: 26,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxShadow: '0 16px 50px rgba(0,0,0,0.10)',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 900, color: 'rgba(10,10,10,0.62)' }}>{label}</div>
      <div style={{ fontSize: 44, fontWeight: 900, color: accent, lineHeight: 1 }}>{value}</div>
    </div>
  );
}
