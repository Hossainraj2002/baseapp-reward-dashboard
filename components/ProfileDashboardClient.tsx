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

type MiniAppActions = {
  ready: (opts?: { disableNativeGestures?: boolean }) => Promise<void>;
  openUrl?: (args: { url: string }) => Promise<void>;
  composeCast?: (args: { text: string; embeds?: string[] }) => Promise<void>;
};

const actions = sdk.actions as unknown as MiniAppActions;

function isEvmAddress(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

function formatUSDC(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function shortAddress(addr: string) {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function safeUsername(u: string | null | undefined): string | null {
  if (!u) return null;
  const t = u.trim();
  if (!t) return null;
  return t.startsWith('@') ? t.slice(1) : t;
}

// ✅ Updated rule:
// - If username ends with .base.eth => base.app/profile/<first-part>
// - Else => base.app/profile/<0xaddress>
function buildBaseAppProfileUrl(username: string | null, address: string): string {
  const u = safeUsername(username);
  if (u && u.toLowerCase().endsWith('.base.eth')) {
    const handle = u.split('.')[0];
    if (handle && handle.length > 0) return `https://base.app/profile/${handle}`;
  }
  return `https://base.app/profile/${address}`;
}

function formatDateOnlyFromIso(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

function formatDateOnlyFromDay(day: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  return day;
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

async function openUrl(url: string) {
  try {
    if (typeof actions.openUrl === 'function') {
      await actions.openUrl({ url });
      return;
    }
  } catch {
    // fallback below
  }

  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    // ignore
  }
}

export default function ProfileDashboardClient() {
  const { context } = useMiniKit();
  const { address: wagmiAddress, isConnected } = useAccount();

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

  const [socialCurrentLoading, setSocialCurrentLoading] = useState(false);
  const [socialCurrent, setSocialCurrent] = useState<SocialApiResponse | null>(null);

  const [socialLastLoading, setSocialLastLoading] = useState(false);
  const [socialLast, setSocialLast] = useState<SocialApiResponse | null>(null);

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

  async function loadSocial(
    fidNum: number,
    startIso: string,
    endIso: string,
    setLoading: (v: boolean) => void,
    setValue: (v: SocialApiResponse | null) => void
  ) {
    setLoading(true);
    setValue(null);
    try {
      const qs = new URLSearchParams({
        fid: String(fidNum),
        start: startIso,
        end: endIso,
      });
      const res = await fetch(`/api/social?${qs.toString()}`, { cache: 'no-store' });
      const json = (await res.json()) as SocialApiResponse;
      setValue(json);
    } catch {
      setValue({ error: 'Failed to load social data' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (addressToQuery) loadProfile(addressToQuery);
  }, [addressToQuery]);

  // ✅ Social windows derived from profile.reward_summary.latest_week_start_utc (no fs imports)
  useEffect(() => {
    if (!fid) return;
    if (!profile || 'error' in profile) return;

    const latestDay = profile.reward_summary.latest_week_start_utc;
    if (!latestDay) return;

    const latestStart = new Date(`${latestDay}T00:00:00.000Z`);
    if (!Number.isFinite(latestStart.getTime())) return;

    const lastEnd = new Date(latestStart.getTime());
    const lastStart = new Date(latestStart.getTime());
    lastStart.setUTCDate(lastStart.getUTCDate() - 7);

    const currentStartIso = latestStart.toISOString();
    const currentEndIso = new Date().toISOString();
    const lastStartIso = lastStart.toISOString();
    const lastEndIso = lastEnd.toISOString();

    loadSocial(fid, currentStartIso, currentEndIso, setSocialCurrentLoading, setSocialCurrent);
    loadSocial(fid, lastStartIso, lastEndIso, setSocialLastLoading, setSocialLast);
  }, [fid, profile]);

  const finalAddress = useMemo(() => {
    if (profile && !('error' in profile)) return profile.address;
    if (addressToQuery) return addressToQuery;
    const m = manualAddress.trim();
    return isEvmAddress(m) ? m : null;
  }, [profile, addressToQuery, manualAddress]);

  const farcaster = profile && !('error' in profile) ? profile.farcaster : null;

  const displayName =
    farcaster?.display_name?.trim() ||
    farcaster?.username?.trim() ||
    (finalAddress ? shortAddress(finalAddress) : 'Profile');

  const username = farcaster?.username ? `@${safeUsername(farcaster.username) ?? farcaster.username}` : null;
  const pfp = farcaster?.pfp_url || null;
  const bio = farcaster?.bio_text || null;

  const scoreValue = farcaster?.score ?? farcaster?.neynar_user_score ?? null;

  const following = farcaster?.following_count ?? null;
  const followers = farcaster?.follower_count ?? null;
  const fidForDisplay = farcaster?.fid ?? null;

  const visitBaseProfileUrl = useMemo(() => {
    if (!finalAddress) return null;
    const u = safeUsername(farcaster?.username);
    return buildBaseAppProfileUrl(u, finalAddress);
  }, [farcaster?.username, finalAddress]);

  const showChangeAddressButton =
    (!profileLoading && !!finalAddress) ||
    (!profileLoading && (!addressToQuery || (profile && 'error' in profile)));

  const latestWeekStartDay = profile && !('error' in profile) ? profile.reward_summary.latest_week_start_utc : null;

  const subtitleCurrent = useMemo(() => {
    if (!latestWeekStartDay) return null;
    const start = formatDateOnlyFromDay(latestWeekStartDay);
    return `[${start} → now]`;
  }, [latestWeekStartDay]);

  const subtitleLast = useMemo(() => {
    if (!latestWeekStartDay) return null;
    const end = new Date(`${latestWeekStartDay}T00:00:00.000Z`);
    if (!Number.isFinite(end.getTime())) return null;
    const start = new Date(end.getTime());
    start.setUTCDate(start.getUTCDate() - 7);
    return `[${formatDateOnlyFromIso(start.toISOString())} → ${formatDateOnlyFromDay(latestWeekStartDay)}]`;
  }, [latestWeekStartDay]);

  const showSocialCreditMessage = (resp: SocialApiResponse | null): boolean => {
    if (!resp) return false;
    if (!('error' in resp)) return false;
    return true;
  };

  return (
    <div className="page" style={{ paddingBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#0000FF' }}>Profile</div>

        {showChangeAddressButton ? (
          <button className="btn" onClick={() => setShowManual((v) => !v)}>
            {showManual ? 'Close' : 'Change address'}
          </button>
        ) : null}
      </div>

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

      <div style={{ marginTop: 12 }}>
        {profileLoading ? (
          <div className="card card-pad">Loading profile…</div>
        ) : profile && 'error' in profile ? (
          <div className="card card-pad" style={{ border: '2px solid #0000FF' }}>
            <div style={{ fontWeight: 900 }}>Failed to load profile</div>
            <div className="subtle" style={{ marginTop: 6 }}>
              {profile.error}
            </div>

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
            <div className="card card-pad" style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 18,
                    overflow: 'hidden',
                    background: '#E5E7EB',
                    border: '1px solid rgba(0,0,255,0.25)',
                    flexShrink: 0,
                  }}
                >
                  {pfp ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pfp} alt="pfp" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : null}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#0A0A0A', lineHeight: 1.2 }}>
                    {displayName}
                  </div>
                  <div style={{ marginTop: 4, fontWeight: 900, color: '#0000FF' }}>
                    {username ? username : shortAddress(profile.address)}
                  </div>
                </div>

                <CopyButton value={profile.address} mode="icon" />
              </div>

              {bio ? (
                <div
                  style={{
                    marginTop: 10,
                    color: '#6B7280',
                    fontWeight: 700,
                    fontSize: 13,
                    lineHeight: 1.35,
                  }}
                >
                  {bio}
                </div>
              ) : null}

              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Chip label="Score" value={scoreValue == null ? '—' : scoreValue.toFixed(2)} />
                <Chip label="FID" value={fidForDisplay == null ? '—' : fidForDisplay.toLocaleString()} />
                <Chip label="Following" value={following == null ? '—' : following.toLocaleString()} />
                <Chip label="Followers" value={followers == null ? '—' : followers.toLocaleString()} />
              </div>
            </div>

            {visitBaseProfileUrl ? (
              <div style={{ marginTop: 10 }}>
                <button
                  className="btn"
                  style={{ width: '100%', height: 46, borderRadius: 16, fontSize: 16, fontWeight: 900 }}
                  onClick={() => void openUrl(visitBaseProfileUrl)}
                >
                  Visit user profile on Baseapp
                </button>
              </div>
            ) : null}
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

      {profile && !('error' in profile) ? (
        <div style={{ marginTop: 14 }}>
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
              subtitle={profile.reward_summary.pct_change == null ? 'Change: —' : `Change: ${profile.reward_summary.pct_change}%`}
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <SectionTitle title="Weekly reward wins" subtitle="Only weeks with rewards are shown" />

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
        </div>
      ) : null}

      {profile && !('error' in profile) ? (
        <div style={{ marginTop: 14 }}>
          <SectionTitle title="Social" subtitle="Engagement on your Farcaster posts" />

          {!fid ? (
            <div className="card card-pad">
              <div className="subtle">Social activity will appear when your FID is available.</div>
            </div>
          ) : null}

          {fid ? (
            <>
              <div style={{ marginTop: 10 }}>
                <SectionTitle title="Current social activity" subtitle={subtitleCurrent ?? undefined} />
                <SocialBlock loading={socialCurrentLoading} data={socialCurrent} onOpenPost={(url) => void openUrl(url)} />
              </div>

              <div style={{ marginTop: 14 }}>
                <SectionTitle title="Social activity of last reward window" subtitle={subtitleLast ?? undefined} />
                <SocialBlock loading={socialLastLoading} data={socialLast} onOpenPost={(url) => void openUrl(url)} />
              </div>

              {(showSocialCreditMessage(socialCurrent) || showSocialCreditMessage(socialLast)) &&
              !socialCurrentLoading &&
              !socialLastLoading ? (
                <div className="card card-pad" style={{ marginTop: 14, border: '1px solid rgba(0,0,255,0.25)' }}>
                  <div style={{ fontWeight: 900, color: '#0A0A0A' }}>Social stats temporarily unavailable</div>
                  <div className="subtle" style={{ marginTop: 6 }}>
                    I’ve run out of Neynar API credits, so I can’t load social activity right now. If I receive support for API costs
                    from the Base team, this section will be enabled again.
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

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
            <div style={{ flex: 1, fontSize: 13, fontWeight: 900, color: '#0A0A0A', wordBreak: 'break-all' }}>
              {SUPPORT_CREATOR_ADDRESS}
            </div>

            <CopyButton value={SUPPORT_CREATOR_ADDRESS} mode="icon" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        height: 26,
        borderRadius: 999,
        border: '1px solid rgba(0,0,255,0.25)',
        background: 'rgba(165,210,255,0.28)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        gap: 8,
        overflow: 'hidden',
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>{label}:</div>
      <div style={{ fontWeight: 900, fontSize: 12, color: '#0A0A0A', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  );
}

function SocialBlock(props: {
  loading: boolean;
  data: SocialApiResponse | null;
  onOpenPost: (url: string) => void;
}) {
  const { loading, data, onOpenPost } = props;

  if (loading) {
    return <div className="card card-pad">Loading social…</div>;
  }

  if (!data) {
    return (
      <div className="card card-pad">
        <div className="subtle">Social data not available.</div>
      </div>
    );
  }

  if ('error' in data) {
    return (
      <div className="card card-pad" style={{ border: '1px solid rgba(0,0,255,0.25)' }}>
        <div style={{ fontWeight: 900 }}>Social data unavailable</div>
        <div className="subtle" style={{ marginTop: 6 }}>
          {data.error}
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <SocialKpiCardLight title="Casts" value={data.engagement.casts.toLocaleString()} />
        <SocialKpiCardLight title="Recasts" value={data.engagement.recasts.toLocaleString()} />
        <SocialKpiCardLight title="Likes" value={data.engagement.likes.toLocaleString()} />
        <SocialKpiCardLight title="Replies" value={data.engagement.replies.toLocaleString()} />
      </div>

      <div style={{ marginTop: 14 }}>
        <SectionTitle title="Top posts" subtitle="Top 7 posts in this window" />

        {data.top_posts.length === 0 ? (
          <div className="card card-pad">
            <div className="subtle">No posts found in this timeframe.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {data.top_posts.map((p) => (
              <div key={p.hash} className="card card-pad" style={{ background: 'rgba(165,210,255,0.18)' }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#0A0A0A' }}>
                  {p.text.length > 220 ? p.text.slice(0, 220) + '…' : p.text}
                </div>

                <div className="subtle" style={{ marginTop: 8 }}>
                  ❤️ {p.likes} · 🔁 {p.recasts} · 💬 {p.replies}
                </div>

                {p.url ? (
                  <div style={{ marginTop: 10 }}>
                    <button className="btn" onClick={() => onOpenPost(p.url)}>
                      Open post
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function SocialKpiCardLight({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: 14,
        padding: 12,
        background: 'rgba(165,210,255,0.22)',
        border: '1px solid rgba(0,0,255,0.18)',
        boxShadow: '0 6px 20px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ fontSize: 12, marginBottom: 6, color: '#6B7280', fontWeight: 900 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: '#0000FF' }}>{value}</div>
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
