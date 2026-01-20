'use client';

import React, { useMemo, useState } from 'react';

type Row = {
  rank: number;
  address: string;
  user_display: string;
  this_week_usdc: number;
  previous_week_usdc: number;
  pct_change: number | null;
  all_time_usdc: number;
};

type Props = {
  initialData: {
    week: {
      week_number: number;
      week_label: string;
      week_start_utc: string;
      week_end_utc: string;
      total_usdc_amount: number;
      total_unique_users: number;
      previous_week_start_utc: string | null;
    };
    rows: Row[];
  };
};

const DEEP_BLUE = '#0000FF';
const LIGHT_BLUE = '#A5D2FF';

function formatUSDC(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPct(p: number | null) {
  if (p === null) return '-';
  return p.toLocaleString(undefined, { maximumFractionDigits: 2 }) + '%';
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

/** Column sizing: sticky Rank+User must be < 40% width */
const COL_RANK = 40;
const COL_USER = 120;
const COL_NUM = 111;

export default function WeeklyLeaderboardClient(props: Props) {
  // IMPORTANT: keep original logic contract. If initialData is missing, that is a real bug.
  const rows = props.initialData.rows;

  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('');
  const pageSize = 50;

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

  function exportJson() {
    const name = 'weekly_' + props.initialData.week.week_start_utc + '.json';
    const payload = JSON.stringify(
      { week: props.initialData.week, rows: filtered },
      null,
      2
    );
    downloadText(name, payload, 'application/json');
  }

  function exportCsv() {
    const header = 'rank,address,this_week_usdc,previous_week_usdc,pct_change,all_time_usdc';
    const lines: string[] = [header];

    for (const r of filtered) {
      const pct = r.pct_change === null ? '' : String(r.pct_change);
      lines.push(
        [
          String(r.rank),
          r.address,
          String(r.this_week_usdc),
          String(r.previous_week_usdc),
          pct,
          String(r.all_time_usdc),
        ].join(',')
      );
    }

    const name = 'weekly_' + props.initialData.week.week_start_utc + '.csv';
    downloadText(name, lines.join('\n'), 'text/csv');
  }

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
      {/* Controls: compact, deep-blue outline */}
      <div style={controlsRow}>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search by wallet (0x...)"
          style={searchInput}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={exportCsv} style={btnStyle}>
            Export CSV
          </button>
          <button type="button" onClick={exportJson} style={btnStyle}>
            Export JSON
          </button>
        </div>
      </div>

      <div style={controlsRow}>
        <button type="button" onClick={goPrev} style={btnStyle}>
          Prev
        </button>

        <div style={pageText}>
          Page <span style={{ fontWeight: 900 }}>{safePage}</span> / {totalPages} (
          {filtered.length.toLocaleString()} rows)
        </div>

        <button type="button" onClick={goNext} style={btnStyle}>
          Next
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            placeholder="Page #"
            inputMode="numeric"
            style={pageInputStyle}
          />
          <button type="button" onClick={jump} style={btnStyle}>
            Jump
          </button>
        </div>
      </div>

      {/* Table: deep-blue header, light-blue rank column, rest white */}
      <div style={tableWrap}>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
              minWidth: 660,
              background: '#ffffff',
            }}
          >
            <colgroup>
              <col style={{ width: COL_RANK }} />
              <col style={{ width: COL_USER }} />
              <col style={{ width: COL_NUM }} />
              <col style={{ width: COL_NUM }} />
              <col style={{ width: COL_NUM }} />
              <col style={{ width: COL_NUM }} />
            </colgroup>

            <thead>
              <tr>
                <th style={thStickyRank}>Rank</th>
                <th style={thStickyUser}>User</th>
                <th style={th}>This week</th>
                <th style={th}>Prev week</th>
                <th style={th}>% change</th>
                <th style={th}>All time</th>
              </tr>
            </thead>

            <tbody>
              {pageRows.map((r) => (
                <tr key={r.address} style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                  <td style={tdStickyRank}>{r.rank}</td>

                  <td style={tdStickyUser}>
                    <a
                      href={'/find/' + r.address}
                      style={{
                        color: '#000000',
                        textDecoration: 'none',
                        fontWeight: 900,
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textAlign: 'center',
                      }}
                      title={r.address}
                    >
                      {r.user_display}
                    </a>
                  </td>

                  <td style={td}>${formatUSDC(r.this_week_usdc)}</td>
                  <td style={td}>${formatUSDC(r.previous_week_usdc)}</td>
                  <td style={td}>{formatPct(r.pct_change)}</td>
                  <td style={td}>${formatUSDC(r.all_time_usdc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 12, color: '#000000' }}>
          No rewards found for this week.
        </div>
      ) : null}
    </div>
  );
}

/* ---- Styles ---- */

const controlsRow: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  marginBottom: 10,
  flexWrap: 'wrap',
};

const searchInput: React.CSSProperties = {
  flex: 1,
  minWidth: 190,
  border: '1px solid rgba(0,0,0,0.18)',
  borderRadius: 12,
  padding: '9px 10px',
  fontSize: 13,
  background: '#ffffff',
};

const pageInputStyle: React.CSSProperties = {
  width: 92,
  border: '1px solid rgba(0,0,0,0.18)',
  borderRadius: 12,
  padding: '9px 10px',
  fontSize: 13,
  background: '#ffffff',
};

const btnStyle: React.CSSProperties = {
  border: `1px solid ${DEEP_BLUE}`,
  color: DEEP_BLUE,
  background: '#ffffff',
  borderRadius: 12,
  padding: '9px 10px',
  fontSize: 13,
  fontWeight: 900,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const pageText: React.CSSProperties = {
  fontSize: 12,
  color: '#000000',
  whiteSpace: 'nowrap',
};

const tableWrap: React.CSSProperties = {
  border: `1px solid ${DEEP_BLUE}`,
  borderRadius: 14,
  overflow: 'hidden',
  background: '#ffffff',
};

const thBase: React.CSSProperties = {
  padding: '8px 6px',
  whiteSpace: 'nowrap',
  textAlign: 'center',
  fontSize: 11,
  fontWeight: 900,
  background: DEEP_BLUE,
  color: '#ffffff',
};

const tdBase: React.CSSProperties = {
  padding: '8px 6px',
  whiteSpace: 'nowrap',
  fontSize: 13,
  fontWeight: 900,
  textAlign: 'center',
  background: '#ffffff',
  color: '#000000',
};

const th: React.CSSProperties = thBase;
const td: React.CSSProperties = tdBase;

const thStickyRank: React.CSSProperties = {
  ...thBase,
  position: 'sticky',
  left: 0,
  zIndex: 5,
};

const thStickyUser: React.CSSProperties = {
  ...thBase,
  position: 'sticky',
  left: COL_RANK,
  zIndex: 5,
};

const tdStickyRank: React.CSSProperties = {
  ...tdBase,
  position: 'sticky',
  left: 0,
  zIndex: 4,
  background: LIGHT_BLUE,
  color: DEEP_BLUE,
};

const tdStickyUser: React.CSSProperties = {
  ...tdBase,
  position: 'sticky',
  left: COL_RANK,
  zIndex: 4,
  background: '#ffffff',
  color: '#000000',
};
