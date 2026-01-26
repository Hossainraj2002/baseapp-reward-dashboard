import { ImageResponse } from 'next/og';

export const runtime = 'edge';

function pick(searchParams: URLSearchParams, key: string, fallback = '') {
  const v = searchParams.get(key);
  return v == null ? fallback : v;
}

function pickNum(searchParams: URLSearchParams, key: string, fallback = 0) {
  const v = Number(searchParams.get(key));
  return Number.isFinite(v) ? v : fallback;
}

function formatUSDC(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const name = pick(searchParams, 'name', 'Profile');
  const username = pick(searchParams, 'username', '');
  const pfp = pick(searchParams, 'pfp', '');

  const allTime = pickNum(searchParams, 'allTime', 0);
  const weeks = pickNum(searchParams, 'weeks', 0);
  const latestLabel = pick(searchParams, 'latestLabel', 'Latest week');
  const latestUsdc = pickNum(searchParams, 'latestUsdc', 0);

  const casts = pickNum(searchParams, 'casts', 0);
  const likes = pickNum(searchParams, 'likes', 0);
  const recasts = pickNum(searchParams, 'recasts', 0);
  const replies = pickNum(searchParams, 'replies', 0);

  const appLink = 'https://base.app/app/baseapp-reward-dashboard.vercel.app';

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: 'flex',
          padding: 40,
          background: 'linear-gradient(135deg, #0000FF 0%, #6D28D9 100%)',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 48,
            background: 'rgba(255,255,255,0.16)',
            padding: 18,
            display: 'flex',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 40,
              background: '#FFFFFF',
              padding: 30,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div
              style={{
                height: 140,
                borderRadius: 34,
                background: 'linear-gradient(90deg, #0000FF 0%, #3B82F6 100%)',
                display: 'flex',
                alignItems: 'center',
                padding: 24,
                gap: 18,
              }}
            >
              <div
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 999,
                  overflow: 'hidden',
                  background: 'rgba(255,255,255,0.35)',
                  border: '2px solid rgba(255,255,255,0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {pfp ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pfp} width={96} height={96} style={{ objectFit: 'cover' }} alt="pfp" />
                ) : (
                  <div style={{ color: '#fff', fontSize: 28, fontWeight: 900 }}>BA</div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', color: '#fff', flex: 1 }}>
                <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1.1 }}>{name}</div>
                <div style={{ fontSize: 24, fontWeight: 800, opacity: 0.92 }}>{username}</div>
              </div>
            </div>

            {/* Title */}
            <div style={{ marginTop: 18, fontSize: 30, fontWeight: 900, color: '#111827' }}>
              Rewards + Social (Latest Week)
            </div>

            {/* Stats grid */}
            <div style={{ marginTop: 18, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              {[
                { k: 'All-time rewards', v: `$${formatUSDC(allTime)}` },
                { k: 'Earning weeks', v: String(weeks) },
                { k: latestLabel, v: `$${formatUSDC(latestUsdc)}` },
                { k: 'Casts', v: String(casts) },
                { k: 'Likes', v: String(likes) },
                { k: 'Recasts', v: String(recasts) },
                { k: 'Replies', v: String(replies) },
              ].map((b) => (
                <div
                  key={b.k}
                  style={{
                    width: 360,
                    height: 110,
                    borderRadius: 26,
                    padding: 18,
                    background: 'linear-gradient(135deg, #0B1020 0%, #1D4ED8 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}
                >
                  <div style={{ color: 'rgba(255,255,255,0.86)', fontSize: 18, fontWeight: 900 }}>{b.k}</div>
                  <div style={{ color: '#FFFFFF', fontSize: 36, fontWeight: 900, marginTop: 6 }}>{b.v}</div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ marginTop: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#111827' }}>Check yours on Base:</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#0000FF' }}>{appLink}</div>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
