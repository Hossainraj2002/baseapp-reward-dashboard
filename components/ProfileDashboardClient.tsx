'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMiniKit } from '@coinbase/onchainkit/minikit';
import { useAccount } from 'wagmi';
import { sdk } from '@farcaster/miniapp-sdk';
import CopyButton from '@/components/CopyButton';

const SUPPORT_CREATOR_ADDRESS = '0xd4a1D777e2882487d47c96bc23A47CeaB4f4f18A';

type ProfileApiResponse =
  | {
      address: string;
      farcaster: null | { fid: number; username: string; pfp_url: string | null };
      reward_summary: {
        all_time_usdc: number;
        total_weeks_earned: number;
        latest_week_usdc: number;
        latest_week_start_utc: string;
        latest_week_label: string;
        previous_week_usdc: number;
        previous_week_start_utc: string | null;
        previous_week_label: string | null;
        pct_change: string | null;
      };
      reward_history: Array<{
        week_start_utc: string;
        week_label: string;
        week_number: number;
        usdc: number;
      }>;
      meta: { created_by: string; support_address: string };
    }
  | { error: string };

type SocialApiResponse =
  | {
      fid: number;
      user: {
        username: string | null;
        display_name: string | null;
        pfp_url: string | null;
        follower_count: number;
        following_count: number;
      };
      window: { start_utc: string; end_utc: string };
      engagement: { casts: number; likes: number; recasts: number; replies: number };
      top_posts: Array<{
        hash: string;
        text: string;
        created_at: string;
        likes: number;
        recasts: number;
        replies: number;
        url: string;
      }>;
    }
  | { error: string };

type WebShareNavigator = Navigator & {
  share?: (data: { text?: string; url?: string; files?: File[]; title?: string }) => Promise<void>;
};

function isEvmAddress(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

function formatUSDC(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function shortAddress(addr: string) {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function pickAddressFromMiniKitContext(ctx: unknown): string | null {
  const c = ctx as {
    user?: {
      verified_addresses?: { eth_addresses?: string[] };
      custody_address?: string;
    };
  };

  const a = c?.user?.verified_addresses?.eth_addresses?.[0] || c?.user?.custody_address || null;
  return typeof a === 'string' && isEvmAddress(a) ? a : null;
}

function pickFidFromMiniKitContext(ctx: unknown): number | null {
  if (!ctx) return null;

  const c = ctx as Record<string, unknown>;

  const possibleFids: Array<unknown> = [
    (c.user as Record<string, unknown> | undefined)?.fid,
    c.fid,
    (c.client as Record<string, unknown> | undefined)?.fid,
    ((c.frame as Record<string, unknown> | undefined)?.user as Record<string, unknown> | undefined)?.fid,
  ];

  for (const raw of possibleFids) {
    if (raw != null) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }

  return null;
}


export default function ProfileDashboardClient() {
  const { context } = useMiniKit();
  const { address: wagmiAddress, isConnected } = useAccount();

  // SDK context (more reliable in miniapps)
  const [sdkFid, setSdkFid] = useState<number | null>(null);

  useEffect(() => {
    sdk.context
      .then((ctx) => {
        const v = ctx?.user?.fid;
        if (typeof v === 'number' && v > 0) setSdkFid(v);
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const minikitFid = useMemo(() => pickFidFromMiniKitContext(context), [context]);
  const fid = sdkFid ?? minikitFid;

  const addressFromContext = useMemo(() => pickAddressFromMiniKitContext(context), [context]);

  const addressToQuery = useMemo(() => {
    if (isConnected && wagmiAddress && isEvmAddress(wagmiAddress)) return wagmiAddress;
    if (addressFromContext) return addressFromContext;
    return null;
  }, [isConnected, wagmiAddress, addressFromContext]);

  const [manualAddress, setManualAddress] = useState('');
  const [showManual, setShowManual] = useState(false);

  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<ProfileApiResponse | null>(null);

  const [socialLoading, setSocialLoading] = useState(false);
  const [social, setSocial] = useState<SocialApiResponse | null>(null);

  async function loadProfile(addr: string) {
    setProfileLoading(true);
    setProfile(null);
    try {
      const res = await fetch(`/api/profile?address=${encodeURIComponent(addr)}`, { cache: 'no-store' });
      const json = (await res.json()) as ProfileApiResponse;
      setProfile(json);
    } catch {
      setProfile({ error: 'Failed to load profile' });
    } finally {
      setProfileLoading(false);
    }
  }

  async function loadSocial(fidNum: number, startUtc: string, endUtc: string) {
    setSocialLoading(true);
    setSocial(null);
    try {
      const qs = new URLSearchParams({
        fid: String(fidNum),
        start: startUtc,
        end: endUtc,
      });
      const res = await fetch(`/api/social?${qs.toString()}`, { cache: 'no-store' });
      const json = (await res.json()) as SocialApiResponse;
      setSocial(json);
    } catch {
      setSocial({ error: 'Failed to load social data' });
    } finally {
      setSocialLoading(false);
    }
  }

  // Auto load profile when we have an address
  useEffect(() => {
    if (addressToQuery) loadProfile(addressToQuery);
  }, [addressToQuery]);

  // IMPORTANT FIX:
  // Your social window should be [previous_week_start .. latest_week_start + 1 day)
  // Otherwise you often exclude the latest-day activity and get zeros.
  // Auto load social after profile is ready (latest reward week window = 7 days)
useEffect(() => {
  if (!fid) return;
  if (!profile || 'error' in profile) return;

  const endDay = profile.reward_summary.latest_week_start_utc; // YYYY-MM-DD
  if (!endDay) return;

  // end = latest week start at 00:00Z
  const endMs = Date.parse(`${endDay}T00:00:00.000Z`);
  if (!Number.isFinite(endMs)) return;

  // start = end - 7 days
  const startMs = endMs - 7 * 24 * 60 * 60 * 1000;

  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();

  loadSocial(fid, startIso, endIso);
}, [fid, profile]);

  const finalAddress = useMemo(() => {
    if (profile && !('error' in profile)) return profile.address;
    if (addressToQuery) return addressToQuery;
    const m = manualAddress.trim();
    return isEvmAddress(m) ? m : null;
  }, [profile, addressToQuery, manualAddress]);

  const headerName =
    social && !('error' in social) ? social.user.display_name || social.user.username || 'Profile' : 'Profile';

  const headerUsername =
    social && !('error' in social) ? (social.user.username ? `@${social.user.username}` : null) : null;

  const headerPfp = social && !('error' in social) ? social.user.pfp_url : null;

  const showChangeAddressButton =
    (!profileLoading && !!finalAddress) || (!profileLoading && (!addressToQuery || (profile && 'error' in profile)));

  return (
    <div className="page" style={{ paddingBottom: 28 }}>
      {/* Header (NO Find button) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              overflow: 'hidden',
              background: '#E5E7EB',
              border: '1px solid rgba(0,0,255,0.25)',
              flexShrink: 0,
            }}
          >
            {headerPfp ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={headerPfp} alt="pfp" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : null}
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#0A0A0A', lineHeight: 1.2 }}>{headerName}</div>
            <div className="subtle" style={{ marginTop: 2 }}>
              {headerUsername ? headerUsername : finalAddress ? shortAddress(finalAddress) : 'Wallet not detected'}
            </div>
          </div>
        </div>

        {showChangeAddressButton ? (
          <button className="btn" onClick={() => setShowManual((v) => !v)}>
            {showManual ? 'Close' : 'Change address'}
          </button>
        ) : null}
      </div>

      {/* Collapsed wallet/address panel */}
      {showManual ? (
        <div className="card card-pad" style={{ marginTop: 12, border: '2px solid #0000FF' }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Wallet address</div>

          {finalAddress ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1, fontWeight: 900, wordBreak: 'break-all' }}>{finalAddress}</div>
              <CopyButton value={finalAddress} mode="icon" />
            </div>
          ) : (
            <div className="subtle" style={{ marginBottom: 12 }}>
              No wallet detected. Paste an address below.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={manualAddress}
              onChange={(e) => setManualAddress(e.target.value)}
              placeholder="0x..."
              style={{
                flex: 1,
                border: '1px solid rgba(10,10,10,0.2)',
                borderRadius: 12,
                padding: '10px 12px',
                fontWeight: 800,
              }}
            />
            <button
              className="btn"
              onClick={() => {
                const m = manualAddress.trim();
                if (isEvmAddress(m)) {
                  loadProfile(m);
                  setShowManual(false);
                } else {
                  setProfile({ error: 'Invalid address. Expected 0x...' });
                }
              }}
            >
              Load
            </button>
          </div>
        </div>
      ) : null}

      {/* Followers / Following */}
      <div style={{ marginTop: 10 }}>
        {socialLoading ? (
          <div className="subtle">Loading social…</div>
        ) : social && !('error' in social) ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <MiniStat title="Followers" value={social.user.follower_count.toLocaleString()} />
            <MiniStat title="Following" value={social.user.following_count.toLocaleString()} />
          </div>
        ) : (
          <div className="subtle">Social data not available{fid ? '' : ' (FID not detected)'}.</div>
        )}
      </div>

      {/* Onchain section */}
      <div style={{ marginTop: 14 }}>
        {profileLoading ? (
          <div className="card card-pad">Loading profile…</div>
        ) : profile && 'error' in profile ? (
          <div className="card card-pad" style={{ border: '2px solid #0000FF' }}>
            <div style={{ fontWeight: 900 }}>Failed to load profile</div>
            <div className="subtle" style={{ marginTop: 6 }}>{profile.error}</div>

            {!addressToQuery ? (
              <div style={{ marginTop: 12 }}>
                <button className="btn" onClick={() => setShowManual(true)}>
                  Enter address
                </button>
              </div>
            ) : null}
          </div>
        ) : profile && !('error' in profile) ? (
          <>
            <SectionTitle title="Onchain rewards" subtitle="Your Base app weekly reward stats" />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <KpiCardDeep title="All-time rewards" value={`$${formatUSDC(profile.reward_summary.all_time_usdc)}`} />
              <KpiCardDeep title="Earning weeks" value={profile.reward_summary.total_weeks_earned.toLocaleString()} />
              <KpiCardDeep
                title={profile.reward_summary.latest_week_label}
                value={`$${formatUSDC(profile.reward_summary.latest_week_usdc)}`}
                subtitle="Current week"
              />
              <KpiCardDeep
                title={profile.reward_summary.previous_week_label || 'Previous week'}
                value={`$${formatUSDC(profile.reward_summary.previous_week_usdc)}`}
                subtitle={
                  profile.reward_summary.pct_change == null ? 'Change: —' : `Change: ${profile.reward_summary.pct_change}%`
                }
              />
            </div>

            {/* Reward history grid */}
            <div style={{ marginTop: 14 }}>
              <SectionTitle title="Weeks you earned rewards" subtitle="Only weeks with rewards are shown" />

              {profile.reward_history.filter((x) => x.usdc > 0).length === 0 ? (
                <div className="card card-pad">
                  <div className="subtle">No reward history found for this address.</div>
                </div>
              ) : (
                <div
                  style={{
                    border: '1px solid rgba(10,10,10,0.12)',
                    borderRadius: 14,
                    background: '#FFFFFF',
                    padding: 10,
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {profile.reward_history
                      .filter((x) => x.usdc > 0)
                      .map((w) => (
                        <div
                          key={w.week_start_utc}
                          style={{
                            border: '1px solid rgba(10,10,10,0.08)',
                            borderRadius: 12,
                            padding: 10,
                            background: '#FFFFFF',
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 900, color: '#0000FF' }}>{w.week_label}</div>
                          <div style={{ marginTop: 6, fontWeight: 900 }}>${formatUSDC(w.usdc)}</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Social engagement */}
            <div style={{ marginTop: 14 }}>
              <SectionTitle title="Social engagement" subtitle="Latest reward week window" />

              {socialLoading ? (
                <div className="card card-pad">Loading social…</div>
              ) : social && 'error' in social ? (
                <div className="card card-pad" style={{ border: '2px solid #0000FF' }}>
                  <div style={{ fontWeight: 900 }}>Social not available</div>
                  <div className="subtle" style={{ marginTop: 6 }}>{social.error}</div>
                </div>
              ) : social && !('error' in social) ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <KpiCardDeep title="Casts" value={social.engagement.casts.toLocaleString()} />
                    <KpiCardDeep title="Recasts" value={social.engagement.recasts.toLocaleString()} />
                    <KpiCardDeep title="Likes" value={social.engagement.likes.toLocaleString()} />
                    <KpiCardDeep title="Replies" value={social.engagement.replies.toLocaleString()} />
                  </div>

                  {/* Top posts */}
                  <div style={{ marginTop: 14 }}>
                    <SectionTitle title="Top posts this week" subtitle="Top 7 posts in latest reward week window" />

                    {social.top_posts.length === 0 ? (
                      <div className="card card-pad">
                        <div className="subtle">No posts found in this timeframe.</div>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {social.top_posts.map((p) => (
                          <div key={p.hash} className="card card-pad">
                            <div style={{ fontSize: 13, fontWeight: 900, color: '#0A0A0A' }}>
                              {p.text.length > 220 ? p.text.slice(0, 220) + '…' : p.text}
                            </div>

                            <div className="subtle" style={{ marginTop: 8 }}>
                              ❤️ {p.likes} · 🔁 {p.recasts} · 💬 {p.replies}
                            </div>

                            {p.url ? (
                              <div style={{ marginTop: 10 }}>
                                <a className="btn" href={p.url} target="_blank" rel="noreferrer">
                                  Open post
                                </a>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Share section */}
                  <div style={{ marginTop: 14 }}>
                    <SectionTitle title="Share your stats" subtitle="Generate a shareable card + copy text" />
                    <ShareCard
                      pfpUrl={headerPfp || null}
                      displayName={headerName}
                      username={headerUsername || ''}
                      onchain={{
                        allTime: profile.reward_summary.all_time_usdc,
                        weeks: profile.reward_summary.total_weeks_earned,
                        latestLabel: profile.reward_summary.latest_week_label,
                        latestUsdc: profile.reward_summary.latest_week_usdc,
                        casts: social.engagement.casts,
                        likes: social.engagement.likes,
                        recasts: social.engagement.recasts,
                        replies: social.engagement.replies,
                      }}
                    />
                  </div>
                </>
              ) : (
                <div className="card card-pad">
                  <div className="subtle">Social will appear when FID is available.</div>
                </div>
              )}
            </div>

            {/* Credits + Support */}
            <div style={{ marginTop: 16 }}>
              <div className="card card-pad">
                <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 10 }}>
                  created by 🅰️kbar |{' '}
                  <a href="https://x.com/akbarX402" target="_blank" rel="noreferrer">
                    x
                  </a>{' '}
                  |{' '}
                  <a href="https://base.app/profile/akbaronchain" target="_blank" rel="noreferrer">
                    baseapp
                  </a>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      flex: 1,
                      fontSize: 13,
                      fontWeight: 900,
                      color: '#0A0A0A',
                      wordBreak: 'break-all',
                    }}
                  >
                    {SUPPORT_CREATOR_ADDRESS}
                  </div>

                  <CopyButton value={SUPPORT_CREATOR_ADDRESS} mode="icon" />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="card card-pad">
            <div className="subtle">Waiting for address…</div>
            {!addressToQuery ? (
              <div style={{ marginTop: 12 }}>
                <button className="btn" onClick={() => setShowManual(true)}>
                  Enter address
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        flex: 1,
        border: '1px solid rgba(10,10,10,0.12)',
        borderRadius: 14,
        padding: 10,
        background: '#FFFFFF',
      }}
    >
      <div className="subtle" style={{ marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function KpiCardDeep({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div
      style={{
        borderRadius: 14,
        padding: 12,
        background: '#0000FF',
        border: '1px solid rgba(0,0,255,0.35)',
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.95, marginBottom: 6, color: '#FFFFFF', fontWeight: 900 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: '#FFFFFF' }}>{value}</div>
      {subtitle ? (
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.95, color: '#FFFFFF', fontWeight: 900 }}>{subtitle}</div>
      ) : null}
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginTop: 6, marginBottom: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: '#0000FF' }}>{title}</div>
      {subtitle ? (
        <div className="subtle" style={{ marginTop: 2 }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function ShareCard(props: {
  pfpUrl: string | null;
  displayName: string;
  username: string;
  onchain: {
    allTime: number;
    weeks: number;
    latestLabel: string;
    latestUsdc: number;
    casts: number;
    likes: number;
    recasts: number;
    replies: number;
  };
}) {
  const [imgDataUrl, setImgDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const miniAppLink = 'https://base.app/app/baseapp-reward-dashboard.vercel.app';

  // This is the IMPORTANT change:
  // We share a URL that has OG meta tags -> X/Base can preview image reliably.
  const sharePageUrl = useMemo(() => {
    const origin =
      typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://baseapp-reward-dashboard.vercel.app';

    const qs = new URLSearchParams({
      name: props.displayName || 'Profile',
      username: props.username || '',
      pfp: props.pfpUrl || '',
      allTime: String(props.onchain.allTime),
      weeks: String(props.onchain.weeks),
      latestLabel: props.onchain.latestLabel,
      latestUsdc: String(props.onchain.latestUsdc),
      casts: String(props.onchain.casts),
      likes: String(props.onchain.likes),
      recasts: String(props.onchain.recasts),
      replies: String(props.onchain.replies),
    });

    return `${origin}/share?${qs.toString()}`;
  }, [props.displayName, props.username, props.pfpUrl, props.onchain]);

  const shareText =
    `I just checked my Base App Reward Dashboard — feeling based.\n` +
    `Rewards + engagement (latest week).\n` +
    `Open the app: ${miniAppLink}\n` +
    `My card: ${sharePageUrl}`;

  async function generateCanvasCard(): Promise<string | null> {
    setBusy(true);
    try {
      const size = 1080;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Background gradient
      const bg = ctx.createLinearGradient(0, 0, size, size);
      bg.addColorStop(0, '#0000FF');
      bg.addColorStop(1, '#6D28D9');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);

      // Outer frame
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      roundRect(ctx, 50, 50, 980, 980, 64);
      ctx.fill();

      // Inner card
      ctx.fillStyle = '#FFFFFF';
      roundRect(ctx, 85, 85, 910, 910, 56);
      ctx.fill();

      // Decorative top bar
      const bar = ctx.createLinearGradient(85, 85, 995, 220);
      bar.addColorStop(0, '#0000FF');
      bar.addColorStop(1, '#3B82F6');
      ctx.fillStyle = bar;
      roundRect(ctx, 105, 105, 870, 170, 44);
      ctx.fill();

      // PFP circle
      if (props.pfpUrl) {
        try {
          const img = await loadImage(props.pfpUrl);
          ctx.save();
          ctx.beginPath();
          ctx.arc(190, 190, 62, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(img, 128, 128, 124, 124);
          ctx.restore();
        } catch {
          // ignore
        }
      }

      // Name + username
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 44px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText(trimText(ctx, props.displayName || 'Profile', 600), 280, 175);

      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '800 28px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText(trimText(ctx, props.username || '', 520), 280, 220);

      // Title
      ctx.fillStyle = '#111827';
      ctx.font = '900 34px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText('Rewards + Social (Latest Week)', 120, 340);

      // Stat boxes
      const boxes = [
        { k: 'All-time rewards', v: `$${formatUSDC(props.onchain.allTime)}` },
        { k: 'Earning weeks', v: `${props.onchain.weeks}` },
        { k: props.onchain.latestLabel, v: `$${formatUSDC(props.onchain.latestUsdc)}` },
        { k: 'Casts', v: `${props.onchain.casts}` },
        { k: 'Likes', v: `${props.onchain.likes}` },
        { k: 'Recasts', v: `${props.onchain.recasts}` },
        { k: 'Replies', v: `${props.onchain.replies}` },
      ];

      for (let i = 0; i < boxes.length; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);

        const bx = 120 + col * 450;
        const by = 395 + row * 140;

        const g = ctx.createLinearGradient(bx, by, bx + 410, by + 110);
        g.addColorStop(0, '#0B1020');
        g.addColorStop(1, '#1D4ED8');
        ctx.fillStyle = g;
        roundRect(ctx, bx, by, 410, 110, 26);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '900 20px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillText(trimText(ctx, boxes[i].k, 360), bx + 22, by + 40);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 38px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillText(trimText(ctx, boxes[i].v, 360), bx + 22, by + 84);
      }

      // Footer
      ctx.fillStyle = '#111827';
      ctx.font = '900 22px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText('Check yours on Base:', 120, 1000);

      ctx.fillStyle = '#0000FF';
      ctx.font = '900 22px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText(trimText(ctx, miniAppLink, 780), 320, 1000);

      const dataUrl = canvas.toDataURL('image/png');
      setImgDataUrl(dataUrl);
      return dataUrl;
    } finally {
      setBusy(false);
    }
  }

  async function downloadImage() {
    if (!imgDataUrl) return;
    const blob = dataUrlToBlob(imgDataUrl);
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noreferrer';
    a.download = 'baseapp-reward-card.png';
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function shareNativeLink() {
    const nav = navigator as WebShareNavigator;
    const canShare = typeof nav.share === 'function';

    // Share link + text (reliable in Base app; no image file sharing needed)
    if (!canShare) {
      try {
        await navigator.clipboard.writeText(shareText);
      } catch {
        // ignore
      }
      return;
    }

    try {
      await nav.share({
        text: shareText,
        url: sharePageUrl,
        title: 'Base Reward Card',
      });
    } catch {
      try {
        await navigator.clipboard.writeText(shareText);
      } catch {
        // ignore
      }
    }
  }

  function openXIntent() {
    const intent = new URL('https://x.com/intent/tweet');
    intent.searchParams.set('text', shareText);
    // X prefers URL separately too:
    intent.searchParams.set('url', sharePageUrl);
    window.open(intent.toString(), '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="card card-pad">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" disabled={busy} onClick={() => void generateCanvasCard()}>
          {busy ? 'Generating…' : 'Generate card'}
        </button>

        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(shareText);
            } catch {
              // ignore
            }
          }}
        >
          Copy share text
        </button>

        <button className="btn" onClick={() => void shareNativeLink()}>
          Share
        </button>

        <button className="btn" onClick={() => openXIntent()}>
          Post to X
        </button>

        {imgDataUrl ? (
          <button className="btn" onClick={() => void downloadImage()}>
            Download image
          </button>
        ) : null}
      </div>

      <div className="subtle" style={{ marginTop: 10 }}>
        Sharing uses a link preview (works best on X/Base). Download is for manual posting.
      </div>

      {imgDataUrl ? (
        <div style={{ marginTop: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgDataUrl} alt="share card" style={{ width: '100%', borderRadius: 14 }} />
        </div>
      ) : null}
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function dataUrlToBlob(dataUrl: string) {
  const parts = dataUrl.split(',');
  const mime = parts[0]?.match(/:(.*?);/)?.[1] || 'image/png';
  const binStr = atob(parts[1] || '');
  const len = binStr.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = binStr.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function trimText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  let t = text || '';
  if (ctx.measureText(t).width <= maxWidth) return t;
  while (t.length > 0 && ctx.measureText(t + '…').width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + '…';
}
