'use client';

import React, { useMemo, useState } from 'react';

type Row = {
  rank: number;
  address: string;
  user_display?: string;
  this_week_usdc: string;
  all_time_usdc: string;
};

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatUSDC(usdcString: string) {
  const n = Number(usdcString);
  if (!Number.isFinite(n)) return usdcString;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function LatestWeekLeaderboardClient({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [jumpValue, setJumpValue] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.address.toLowerCase().includes(q));
  }, [rows, query]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  function goPrev() {
    setPage((p) => Math.max(1, p - 1));
  }

  function goNext() {
    setPage((p) => Math.min(totalPages, p + 1));
  }

  function doJump() {
    const n = Number(jumpValue);
    if (!Number.isFinite(n)) return;
    const tgt = Math.min(Math.max(1, Math.floor(n)), totalPages);
    setPage(tgt);
  }

  React.useEffect(() => {
    setPage(1);
  }, [query]);

  return (
    <div>
      {/* Table */}
      <div
        style={{
          border: '1px solid rgba(10,10,10,0.10)',
          borderRadius: 14,
          overflow: 'hidden',
          background: '#ffffff',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 380 }}>
            <thead>
              <tr>
                <th style={thRank}>Rank</th>
                <th style={thUser}>User</th>
                <th style={th}>This week</th>
                <th style={th}>All-time</th>
              </tr>
            </thead>

            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 12, color: '#6B7280', fontSize: 13 }}>
                    No rows match your search.
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => (
                  <tr
                    key={r.address}
                    onClick={() => (window.location.href = `/find/${r.address}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={tdRank}>{r.rank}</td>
                    <td style={tdUser}>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>
                        {r.user_display || shortAddress(r.address)}
                      </div>
                    </td>
                    <td style={tdMoney}>${formatUSDC(r.this_week_usdc)}</td>
                    <td style={tdMoney}>${formatUSDC(r.all_time_usdc)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Controls BELOW leaderboard */}
      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search wallet (0x...)"
          />
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={goPrev} disabled={safePage === 1}>
            Prev
          </button>

          <div style={{ fontSize: 13, color: '#6B7280' }}>
            Page <span style={{ fontWeight: 900, color: '#0A0A0A' }}>{safePage}</span> / {totalPages} (
            {filtered.length.toLocaleString()} rows)
          </div>

          <button type="button" className="btn" onClick={goNext} disabled={safePage === totalPages}>
            Next
          </button>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
            <input
              className="input"
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              placeholder="Page #"
              style={{ width: 110 }}
            />
            <button type="button" className="btn" onClick={doJump}>
              Jump
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----- styles ----- */

const thBase: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 900,
  padding: '10px 10px',
  borderBottom: '1px solid rgba(10,10,10,0.08)',
  whiteSpace: 'nowrap',
};

const th: React.CSSProperties = {
  ...thBase,
  background: '#0000FF',
  color: '#FFFFFF',
};

const thRank: React.CSSProperties = {
  ...th,
  width: 70,
};

const thUser: React.CSSProperties = {
  ...th,
};

const tdBase: React.CSSProperties = {
  padding: '10px 10px',
  borderBottom: '1px solid rgba(10,10,10,0.06)',
  fontSize: 13,
  verticalAlign: 'middle',
  background: '#ffffff',
};

const tdRank: React.CSSProperties = {
  ...tdBase,
  background: '#0000FF',
  color: '#FFFFFF',
  fontWeight: 900,
  width: 70,
};

const tdUser: React.CSSProperties = {
  ...tdBase,
  fontWeight: 800,
};

const tdMoney: React.CSSProperties = {
  ...tdBase,
  textAlign: 'right',
  fontWeight: 900,
};
