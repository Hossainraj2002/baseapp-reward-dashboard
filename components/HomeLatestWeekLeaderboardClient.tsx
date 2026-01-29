'use client';

import React, { useEffect, useMemo, useState } from 'react';

type Row = {
  rank: number;
  address: string;
  user_display?: string;
  this_week_usdc: string | number;
  all_time_usdc: string | number;
  previous_week_usdc?: string | number;
  pct_change?: string | number | null;
};

type Props = {
  rows: Row[];
};

type FarcasterUserLite = {
  fid: number;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
};

function formatUSDC(v: string | number | undefined) {
  if (v === undefined) return '-';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPct(v: string | number | null | undefined) {
  if (v === null || v === undefined) return '-';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 }) + '%';
}

function shortAddress(addr: string) {
  const a = addr.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(a)) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function displayLabel(fc: FarcasterUserLite | null, fallback: string) {
  if (fc?.username) return `@${fc.username}`;
  if (fc?.display_name) return fc.display_name;
  return fallback;
}

export default function HomeLatestWeekLeaderboardClient({ rows }: Props) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('');

  const pageSize = 10;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    if (q.startsWith('0x')) return rows.filter((r) => r.address.toLowerCase().includes(q));
    return rows;
  }, [query, rows]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage]);

  const [fcByAddress, setFcByAddress] = useState<Record<string, FarcasterUserLite | null>>({});

  useEffect(() => {
    const addresses = pageRows
      .map((r) => r.address.toLowerCase())
      .filter((a) => /^0x[a-f0-9]{40}$/.test(a));

    const missing = addresses.filter((a) => !(a in fcByAddress));
    if (missing.length === 0) return;

    const controller = new AbortController();

    async function run() {
      try {
        const qs = encodeURIComponent(missing.join(','));
        const res = await fetch(`/api/farcaster-users?addresses=${qs}`, { signal: controller.signal });
        if (!res.ok) return;

        const json = (await res.json()) as { users?: Record<string, FarcasterUserLite | null> };
        const incoming = json.users || {};

        setFcByAddress((prev) => ({ ...prev, ...incoming }));
      } catch {
        // ignore
      }
    }

    void run();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageRows]);

  function goPrev() {
    setPage((p) => Math.max(1, p - 1));
  }

  function goNext() {
    setPage((p) => Math.min(totalPages, p + 1));
  }

  function jump() {
    const n = Number(pageInput);
    if (!Number.isFinite(n)) return;
    const next = Math.min(Math.max(Math.floor(n), 1), totalPages);
    setPage(next);
  }

  return (
    <div>
      {/* TABLE: tighter widths so 4 columns fit on mobile */}
      <div style={tableWrap}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 54 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 98 }} />
              <col style={{ width: 96 }} />
            </colgroup>

            <thead>
              <tr style={{ fontSize: 11 }}>
                <th style={thStickyRank}>Rank</th>
                <th style={thStickyUser}>User</th>
                <th style={th}>This</th>
                <th style={th}>Prev</th>
                <th style={th}>%</th>
                <th style={th}>All</th>
              </tr>
            </thead>

            <tbody>
              {pageRows.map((r) => {
                const key = r.address.toLowerCase();
                const fc = fcByAddress[key] ?? null;

                const fallback = r.user_display || shortAddress(r.address);
                const label = displayLabel(fc, fallback);

                return (
                  <tr key={r.address} style={{ borderTop: '1px solid rgba(10,10,10,0.08)' }}>
                    <td style={tdStickyRank}>{r.rank}</td>

                    <td style={tdStickyUser}>
                      <a
                        href={'/find/' + r.address}
                        style={userLink}
                        title={label}
                      >
                        <span style={userCell}>
                          {fc?.pfp_url ? (
                            <img
                              src={fc.pfp_url}
                              alt=""
                              style={avatarImg}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <span style={avatarFallback} />
                          )}
                          <span style={userText}>{label}</span>
                        </span>
                      </a>
                    </td>

                    <td style={tdCenter}>${formatUSDC(r.this_week_usdc)}</td>
                    <td style={tdCenter}>${formatUSDC(r.previous_week_usdc)}</td>
                    <td style={tdCenter}>{formatPct(r.pct_change ?? null)}</td>
                    <td style={tdCenter}>${formatUSDC(r.all_time_usdc)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CONTROLS BELOW TABLE */}
      <div style={{ marginTop: 12 }}>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search by wallet (0x...)"
          className="input"
        />

        <div style={controlsRow}>
          <button type="button" onClick={goPrev} className="btn">
            Prev
          </button>

          <div style={{ fontSize: 13, color: '#6B7280', whiteSpace: 'nowrap' }}>
            Page <span style={{ fontWeight: 900, color: '#0A0A0A' }}>{safePage}</span> / {totalPages} (
            {filtered.length.toLocaleString()} rows)
          </div>

          <button type="button" onClick={goNext} className="btn">
            Next
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 10 }}>
          <input
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            placeholder="Page #"
            inputMode="numeric"
            className="input"
            style={{ width: 110 }}
          />
          <button type="button" onClick={jump} className="btn">
            Jump
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Styles ---------- */

const tableWrap: React.CSSProperties = {
  border: '1px solid rgba(10,10,10,0.12)',
  borderRadius: 14,
  overflow: 'hidden',
  background: '#FFFFFF',
};

const thBase: React.CSSProperties = {
  padding: '8px 6px',
  whiteSpace: 'nowrap',
  textAlign: 'center',
  fontWeight: 900,
  background: '#0000FF',
  color: '#FFFFFF',
};

const th: React.CSSProperties = thBase;

const thStickyRank: React.CSSProperties = {
  ...thBase,
  position: 'sticky',
  left: 0,
  zIndex: 3,
};

const thStickyUser: React.CSSProperties = {
  ...thBase,
  position: 'sticky',
  left: 54,
  zIndex: 3,
};

const tdBase: React.CSSProperties = {
  padding: '8px 6px',
  whiteSpace: 'nowrap',
  fontSize: 13,
  background: '#FFFFFF',
};

const tdCenter: React.CSSProperties = {
  ...tdBase,
  textAlign: 'center',
  fontWeight: 900,
};

const tdStickyRank: React.CSSProperties = {
  ...tdBase,
  position: 'sticky',
  left: 0,
  zIndex: 2,
  textAlign: 'center',
  fontWeight: 900,
  background: '#A5D2FF',
  color: '#0000FF',
};

const tdStickyUser: React.CSSProperties = {
  ...tdBase,
  position: 'sticky',
  left: 54,
  zIndex: 2,
  background: '#A5D2FF',
};

const controlsRow: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  marginTop: 12,
  flexWrap: 'wrap',
};

const userLink: React.CSSProperties = {
  color: '#0A0A0A',
  textDecoration: 'none',
  fontWeight: 900,
  display: 'block',
  textAlign: 'center',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const userCell: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  maxWidth: '100%',
};

const userText: React.CSSProperties = {
  display: 'inline-block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 120,
};

const avatarImg: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: 999,
  objectFit: 'cover',
  border: '1px solid rgba(10,10,10,0.12)',
  background: '#FFFFFF',
  flex: '0 0 auto',
};

const avatarFallback: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: 999,
  background: '#FFFFFF',
  border: '1px solid rgba(10,10,10,0.12)',
  flex: '0 0 auto',
};
