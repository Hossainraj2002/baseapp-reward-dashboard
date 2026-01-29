import React from 'react';
import Link from 'next/link';

import CopyButton from '@/components/CopyButton';
import type { ProfilePayload } from '@/lib/profilePayload';

function formatUSDC(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function shortAddress(addr: string): string {
  const a = addr.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(a)) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function baseappHandleFromUsername(username: string): string {
  const u = username.trim();
  const first = u.split('.')[0] || u;
  return first;
}

function clampToTwoDecimals(x: number): string {
  return x.toFixed(2);
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={chip}>
      <span style={chipLabel}>{label}</span>
      <span style={chipValue}>{value}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 950, marginTop: 14, marginBottom: 10, color: '#0A0A0A' }}>
      {children}
    </div>
  );
}

function OnchainCard({ title, value }: { title: string; value: string }) {
  return (
    <div style={onchainCard}>
      <div style={onchainTitle}>{title}</div>
      <div style={onchainValue}>{value}</div>
    </div>
  );
}

export default function FindAddressProfileView({ data }: { data: ProfilePayload }) {
  const fc = data.farcaster;

  const showBaseappLink = Boolean(fc?.username);
  const baseHandle = fc?.username ? baseappHandleFromUsername(fc.username) : null;
  const baseappUrl = baseHandle ? `https://base.app/profile/${encodeURIComponent(baseHandle)}` : null;

  const displayName = fc?.display_name || (fc?.username ? `@${fc.username}` : shortAddress(data.address));
  const usernameLine = fc?.username ? `@${fc.username}` : shortAddress(data.address);

  const bio = fc?.bio_text ? fc.bio_text : null;

  const scoreValue =
    fc?.score != null
      ? clampToTwoDecimals(fc.score)
      : fc?.neynar_user_score != null
        ? clampToTwoDecimals(fc.neynar_user_score)
        : null;

  const followers = fc?.follower_count != null ? fc.follower_count.toLocaleString() : null;
  const following = fc?.following_count != null ? fc.following_count.toLocaleString() : null;
  const fid = fc?.fid != null ? String(fc.fid) : null;

  const historyNewestFirst = [...data.reward_history].sort((a, b) => b.week_number - a.week_number);

  return (
    <div className="page" style={{ padding: 0, paddingBottom: 28 }}>
      {/* Header / Profile info (<= ~5.5cm) */}
      <div className="card" style={headerCard}>
        {/* Top row: PFP left, Name/Username right */}
        <div style={topRow}>
          <div style={avatarWrap}>
            {fc?.pfp_url ? (
              <img src={fc.pfp_url} alt="" style={avatarImg} loading="lazy" referrerPolicy="no-referrer" />
            ) : (
              <div style={avatarFallback} />
            )}
          </div>

          <div style={nameBlock}>
            <div style={nameRow}>
              <div style={displayNameStyle} title={displayName}>
                {displayName}
              </div>
              <CopyButton value={data.address} mode="icon" />
            </div>
            <div style={usernameStyle}>{usernameLine}</div>
          </div>
        </div>

        {/* FULL-WIDTH section under header row (no blank under pfp) */}
        <div style={fullWidthInfo}>
          <div style={bioStyle} title={bio || ''}>
            {bio ? bio : <span style={{ color: '#9CA3AF' }}>No bio available</span>}
          </div>

          <div style={statsBlock}>
            <div style={statsRow}>
              {scoreValue ? <StatChip label="Score:" value={scoreValue} /> : null}
              {fid ? <StatChip label="FID:" value={fid} /> : null}
            </div>
            <div style={statsRow}>
              {following ? <StatChip label="Following:" value={following} /> : null}
              {followers ? <StatChip label="Followers:" value={followers} /> : null}
            </div>
          </div>
        </div>
      </div>

      {/* Baseapp profile button */}
      {showBaseappLink && baseappUrl ? (
        <a href={baseappUrl} target="_blank" rel="noreferrer" className="btn btnPrimary" style={baseappBtn}>
          Visit user profile on Baseapp
        </a>
      ) : null}

      {/* Onchain section */}
      <SectionTitle>Onchain rewards</SectionTitle>
      <div style={cardsGrid2}>
        <OnchainCard title="All-time rewards" value={`$${formatUSDC(data.reward_summary.all_time_usdc)}`} />
        <OnchainCard title="Earning weeks" value={data.reward_summary.total_weeks_earned.toLocaleString()} />
        <OnchainCard title="Current week" value={`$${formatUSDC(data.reward_summary.latest_week_usdc)}`} />
        <OnchainCard title="Previous week" value={`$${formatUSDC(data.reward_summary.previous_week_usdc)}`} />
      </div>

      {/* Weekly wins */}
      <SectionTitle>Weekly reward wins</SectionTitle>
      {historyNewestFirst.length === 0 ? (
        <div className="card card-pad" style={{ color: '#6B7280' }}>
          No reward weeks found for this address.
        </div>
      ) : (
        <div className="card" style={{ padding: 12 }}>
          <div style={weeksGrid3}>
            {historyNewestFirst.map((w) => (
              <div key={w.week_start_utc} style={weekCell}>
                <div style={weekLabel} title={w.week_label}>
                  {`Week ${w.week_number}`}
                </div>
                <div style={weekValue}>{`$${formatUSDC(w.usdc)}`}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <Link href="/find">Back to Find</Link>
      </div>
    </div>
  );
}

/* ---------- Styles ---------- */

const headerCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 18,
  boxShadow: '0 10px 30px rgba(10,10,10,0.06)',
  maxHeight: 208, // ~5.5cm
  overflow: 'hidden',
};

const topRow: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'flex-start',
};

const avatarWrap: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 14,
  overflow: 'hidden',
  border: '1px solid rgba(10,10,10,0.12)',
  background: '#FFFFFF',
  flex: '0 0 auto',
};

const avatarImg: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

const avatarFallback: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background: 'linear-gradient(135deg, rgba(165,210,255,0.7), rgba(0,0,255,0.08))',
};

const nameBlock: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  paddingTop: 2,
};

const nameRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
};

const displayNameStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 950,
  color: '#0A0A0A',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const usernameStyle: React.CSSProperties = {
  marginTop: 2,
  fontSize: 13,
  fontWeight: 950,
  color: '#0000FF',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const fullWidthInfo: React.CSSProperties = {
  marginTop: 8,
};

const bioStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 12.5,
  color: '#6B7280',
  lineHeight: '17px',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

const statsBlock: React.CSSProperties = {
  marginTop: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  alignItems: 'flex-start',
};

const statsRow: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  gap: 10,
  justifyContent: 'flex-start',
  flexWrap: 'nowrap',
};

const chip: React.CSSProperties = {
  height: 26, // <= 0.7cm
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(10,10,10,0.10)',
  background: 'rgba(165,210,255,0.35)',
  boxShadow: '0 10px 18px rgba(10,10,10,0.03)',
  whiteSpace: 'nowrap',
};

const chipLabel: React.CSSProperties = {
  fontSize: 12,
  color: '#6B7280',
  fontWeight: 900,
};

const chipValue: React.CSSProperties = {
  fontSize: 14,
  color: '#0A0A0A',
  fontWeight: 950,
};

const baseappBtn: React.CSSProperties = {
  marginTop: 12,
  width: '100%',
  height: 38, // ~1cm
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textDecoration: 'none',
  borderRadius: 14,
  boxShadow: '0 14px 30px rgba(0,0,255,0.16)',
};

const cardsGrid2: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
};

const onchainCard: React.CSSProperties = {
  borderRadius: 16,
  padding: 14,
  background: '#0000FF',
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '0 16px 34px rgba(0,0,255,0.18)',
  minHeight: 78,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  textAlign: 'center',
};

const onchainTitle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 900,
  color: 'rgba(255,255,255,0.86)',
  marginBottom: 6,
};

const onchainValue: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 950,
  color: '#FFFFFF',
};

const weeksGrid3: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 10,
};

const weekCell: React.CSSProperties = {
  border: '1px solid rgba(10,10,10,0.12)',
  borderRadius: 14,
  padding: 10,
  background: '#FFFFFF',
  boxShadow: '0 10px 22px rgba(10,10,10,0.04)',
  minWidth: 0,
};

const weekLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 950,
  color: '#0000FF',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const weekValue: React.CSSProperties = {
  marginTop: 6,
  fontSize: 14,
  fontWeight: 950,
  color: '#0A0A0A',
};
