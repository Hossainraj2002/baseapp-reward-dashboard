'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMiniKit } from '@coinbase/onchainkit/minikit';
import { useAccount } from 'wagmi';
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

  const a =
    c?.user?.verified_addresses?.eth_addresses?.[0] ||
    c?.user?.custody_address ||
    null;

  return typeof a === 'string' && isEvmAddress(a) ? a : null;
}

function pickFidFromMiniKitContext(ctx: unknown): number | null {
  const c = ctx as { user?: { fid?: string | number } };
  const raw = c?.user?.fid;
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}

export default function ProfileDashboardClient() {
  const { context } = useMiniKit();
  const { address: wagmiAddress, isConnected } = useAccount();

  const fid = useMemo(() => pickFidFromMiniKitContext(context), [context]);

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

  // Auto load social after profile is ready (need latest reward window)
  useEffect(() => {
    if (!fid) return;
    if (!profile || 'error' in profile) return;

    const end = profile.reward_summary.latest_week_start_utc;
    const start = profile.reward_summary.previous_week_start_utc;

    if (!start || !end) return;

    loadSocial(fid, `${start}T00:00:00.000Z`, `${end}T00:00:00.000Z`);
  }, [fid, profile]);

  const finalAddress = useMemo(() => {
    if (addressToQuery) return addressToQuery;
    const m = manualAddress.trim();
    return isEvmAddress(m) ? m : null;
  }, [addressToQuery, manualAddress]);

  const headerName =
    social && !('error' in social) ? (social.user.display_name || social.user.username || 'Profile') : 'Profile';
  const headerUsername =
    social && !('error' in social) ? (social.user.username ? `@${social.user.username}` : null) : null;
  const headerPfp =
    social && !('error' in social) ? social.user.pfp_url : null;

  return (
    <div className="page" style={{ paddingBottom: 28 }}>
      {/* Header */}
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
            <div style={{ fontSize: 18, fontWeight: 900, color: '#0A0A0A', lineHeight: 1.2 }}>
              {headerName}
            </div>
            <div className="subtle" style={{ marginTop: 2 }}>
              {headerUsername ? headerUsername : finalAddress ? shortAddress(finalAddress) : 'Wallet not detected'}
            </div>
          </div>
        </div>

        <Link href="/find" className="btn">
          Find
        </Link>
      </div>

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
          <div className="subtle">
            Social data not available{fid ? '' : ' (FID not detected)'}.
          </div>
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
                <button className="btn" onClick={() => setShowManual(true)}>Enter address</button>
              </div>
            ) : null}
          </div>
        ) : profile && !('error' in profile) ? (
          <>
            {/* Address row (full + copy) */}
            <div className="card card-pad" style={{ marginBottom: 12 }}>
              <div className="subtle" style={{ marginBottom: 6 }}>Wallet address</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, fontWeight: 900, wordBreak: 'break-all' }}>{profile.address}</div>
                <CopyButton value={profile.address} mode="icon" />
              </div>

              <div style={{ marginTop: 10 }}>
                <button className="btn" onClick={() => setShowManual((v) => !v)}>
                  {showManual ? 'Close' : 'Change address'}
                </button>
              </div>

              {showManual ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
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
                      if (isEvmAddress(m)) loadProfile(m);
                      else setProfile({ error: 'Invalid address. Expected 0x...' });
                    }}
                  >
                    Load
                  </button>
                </div>
              ) : null}
            </div>

            {/* Reward cards */}
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
                  profile.reward_summary.pct_change == null
                    ? 'Change: —'
                    : `Change: ${profile.reward_summary.pct_change}%`
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
                          <div style={{ fontSize: 12, fontWeight: 900, color: '#0000FF' }}>
                            {w.week_label}
                          </div>
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
                                  Open on Warpcast
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
                    <SectionTitle title="Share your stats" subtitle="Generate a shareable image (download + copy text)" />
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
                <button className="btn" onClick={() => setShowManual(true)}>Enter address</button>
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
      <div className="subtle" style={{ marginBottom: 4 }}>{title}</div>
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
      <div style={{ fontSize: 12, opacity: 0.95, marginBottom: 6, color: '#FFFFFF', fontWeight: 900 }}>
        {title}
      </div>
      <div style={{ fontSize: 18, fontWeight: 900, color: '#FFFFFF' }}>{value}</div>
      {subtitle ? (
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.95, color: '#FFFFFF', fontWeight: 900 }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginTop: 6, marginBottom: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: '#0000FF' }}>{title}</div>
      {subtitle ? <div className="subtle" style={{ marginTop: 2 }}>{subtitle}</div> : null}
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
  const shareText = `I just checked my Baseapp Weekly Reward Dashboard — feeling based.\nCheck yours: https://baseapp-reward-dashboard.vercel.app/`;

  async function generate() {
    const size = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // background
    ctx.fillStyle = '#0000FF';
    ctx.fillRect(0, 0, size, size);

    // card
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, 60, 70, 960, 940, 44);
    ctx.fill();

    // pfp
    if (props.pfpUrl) {
      try {
        const img = await loadImage(props.pfpUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(140, 160, 56, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, 84, 104, 112, 112);
        ctx.restore();
      } catch {
        // ignore image failures
      }
    }

    // name
    ctx.fillStyle = '#0A0A0A';
    ctx.font = 'bold 44px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillText(props.displayName.slice(0, 28), 220, 150);

    // username
    ctx.fillStyle = '#6B7280';
    ctx.font = 'bold 28px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    const u = props.username ? props.username : '';
    ctx.fillText(u, 220, 195);

    // section title
    ctx.fillStyle = '#0000FF';
    ctx.font = 'bold 34px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillText('Rewards + Social (Latest Week)', 90, 300);

    // stats blocks
    ctx.fillStyle = '#0A0A0A';
    ctx.font = 'bold 30px system-ui, -apple-system, Segoe UI, Roboto, Arial';

    const lines = [
      `All-time rewards: $${formatUSDC(props.onchain.allTime)}`,
      `Earning weeks: ${props.onchain.weeks}`,
      `${props.onchain.latestLabel}: $${formatUSDC(props.onchain.latestUsdc)}`,
      `Casts: ${props.onchain.casts}  Likes: ${props.onchain.likes}`,
      `Recasts: ${props.onchain.recasts}  Replies: ${props.onchain.replies}`,
    ];

    let y = 380;
    for (const line of lines) {
      ctx.fillText(line, 90, y);
      y += 60;
    }

    // footer
    ctx.fillStyle = '#6B7280';
    ctx.font = 'bold 24px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillText('baseapp-reward-dashboard.vercel.app', 90, 980);

    setImgDataUrl(canvas.toDataURL('image/png'));
  }

  return (
    <div className="card card-pad">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" onClick={generate}>Generate image</button>

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

        {imgDataUrl ? (
          <a className="btn" href={imgDataUrl} download="baseapp-reward-stats.png">
            Download image
          </a>
        ) : null}
      </div>

      {imgDataUrl ? (
        <div style={{ marginTop: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgDataUrl} alt="share card" style={{ width: '100%', borderRadius: 14 }} />
        </div>
      ) : (
        <div className="subtle" style={{ marginTop: 10 }}>
          Generate an image, then download it and share with the copied text.
        </div>
      )}
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
