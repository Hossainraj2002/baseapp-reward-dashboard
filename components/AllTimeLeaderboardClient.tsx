'use client';

import React, { useMemo, useState } from 'react';

type Row = {
  all_time_rank: number;
  address: string;
  user_display: string;
  total_usdc: string;
  total_weeks_earned: number;
  weeks: Record<string, string>;
};

type Props = {
  initialData: {
    generated_at_utc: string;
    week_keys: string[]; // ISO week-start keys (source of truth)
    rows: Row[];
  };
};

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

function num(s: string) {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatUSDCFromString(s: string) {
  const n = num(s);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function AllTimeLeaderboardClient(props: Props) {
  const weekKeysChrono = props.initialData.week_keys; // old -> new
  const rows = props.initialData.rows;

  // DISPLAY ORDER: latest week first, then previous weeks
  const weekKeysDisplay = useMemo(() => {
    return [...weekKeysChrono].reverse();
  }, [weekKeysChrono]);

  // DISPLAY LABELS: Week 1..Week N (based on chronological order)
  const weekLabelByKey = useMemo(() => {
    const map: Record<string, string> = {};
    for (let i = 0; i < weekKeysChrono.length; i++) {
      map[weekKeysChrono[i]] = `Week ${i + 1}`;
    }
    return map;
  }, [weekKeysChrono]);

  const latestWeekKey = weekKeysDisplay.length > 0 ? weekKeysDisplay[0] : null;

  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('');
  const pageSize = 25;

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
    const payload = JSON.stringify(
      {
        generated_at_utc: props.initialData.generated_at_utc,
        week_keys: weekKeysChrono,
        rows: filtered,
      },
      null,
      2
    );
    downloadText('all_time_leaderboard.json', payload, 'application/json');
  }

  function exportCsv() {
    // Export stays stable using ISO keys
    const header = ['all_time_rank', 'address', 'total_usdc', 'total_weeks_earned', ...weekKeysChrono].join(',');
    const lines: string[] = [header];

    for (const r of filtered) {
      const baseCols = [
        String(r.all_time_rank),
        r.address,
        String(num(r.total_usdc)),
        String(r.total_weeks_earned),
      ];

      const weekCols = weekKeysChrono.map((wk) => {
        const v = r.weeks && r.weeks[wk] ? num(r.weeks[wk]) : 0;
        return String(v);
      });

      lines.push([...baseCols, ...weekCols].join(','));
    }

    downloadText('all_time_leaderboard.csv', lines.join('\n'), 'text/csv');
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
      {/* SMALL CONTROLS */}
      <div style={controlsRow}>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search wallet (0x...)"
          className="input"
          style={smallInput}
        />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" onClick={exportJson} className="btn" style={smallBtn}>
            Export JSON
          </button>
          <button type="button" onClick={exportCsv} className="btn" style={smallBtn}>
            Export CSV
          </button>
        </div>
      </div>

      <div style={controlsRow}>
        <button type="button" onClick={goPrev} className="btn" style={smallBtn}>
          Prev
        </button>

        <div style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>
          Page <span style={{ fontWeight: 900, color: '#0A0A0A' }}>{safePage}</span> / {totalPages} (
          {filtered.length.toLocaleString()} rows)
        </div>

        <button type="button" onClick={goNext} className="btn" style={smallBtn}>
          Next
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            placeholder="Page #"
            inputMode="numeric"
            className="input"
            style={{ ...smallInput, width: 92 }}
          />
          <button type="button" onClick={jump} className="btn" style={smallBtn}>
            Jump
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div style={tableWrap}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: COL_RANK }} />
              <col style={{ width: COL_USER }} />
              <col style={{ width: COL_TOTAL }} />

              {/* Latest week column (NOT sticky) */}
              {latestWeekKey ? <col style={{ width: COL_WEEK }} /> : null}

              {/* Remaining weeks (NOT sticky) */}
              {weekKeysDisplay
                .filter((wk) => wk !== latestWeekKey)
                .map((wk) => (
                  <col key={wk} style={{ width: COL_WEEK }} />
                ))}
            </colgroup>

            <thead>
              <tr style={{ fontSize: 11 }}>
                <th style={thStickyRank}>Rank</th>
                <th style={thStickyUser}>User</th>
                <th style={thStickyTotal}>Total</th>

                {latestWeekKey ? (
                  <th style={th}>{weekLabelByKey[latestWeekKey] || 'Latest'}</th>
                ) : null}

                {weekKeysDisplay
                  .filter((wk) => wk !== latestWeekKey)
                  .map((wk) => (
                    <th key={wk} style={th}>
                      {weekLabelByKey[wk] || wk}
                    </th>
                  ))}
              </tr>
            </thead>

            <tbody>
              {pageRows.map((r) => (
                <tr key={r.address} style={{ borderTop: '1px solid rgba(10,10,10,0.08)' }}>
                  {/* Rank column ONLY light blue */}
                  <td style={tdStickyRank}>{r.all_time_rank}</td>

                  <td style={tdStickyUser}>
                    <a
                      href={'/find/' + r.address}
                      style={{
                        color: '#0A0A0A',
                        textDecoration: 'none',
                        fontWeight: 900,
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textAlign: 'center',
                      }}
                      title={r.user_display}
                    >
                      {r.user_display}
                    </a>
                  </td>

                  <td style={tdStickyTotal}>${formatUSDCFromString(r.total_usdc)}</td>

                  {latestWeekKey ? (
                    <td style={td}>
                      {r.weeks && r.weeks[latestWeekKey]
                        ? '$' + formatUSDCFromString(r.weeks[latestWeekKey])
                        : ''}
                    </td>
                  ) : null}

                  {weekKeysDisplay
                    .filter((wk) => wk !== latestWeekKey)
                    .map((wk) => {
                      const v = r.weeks && r.weeks[wk] ? formatUSDCFromString(r.weeks[wk]) : '';
                      return (
                        <td key={wk} style={td}>
                          {v ? '$' + v : ''}
                        </td>
                      );
                    })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>
        Tip: swipe horizontally to see all weeks.
      </div>
    </div>
  );
}

/* ---------- Sizes: these 3 sticky cols <= 60% ---------- */
const COL_RANK = 35;
const COL_USER = 120;
const COL_TOTAL = 60;
const COL_WEEK = 60;

/* ---------- Controls ---------- */
const controlsRow: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  marginBottom: 10,
  flexWrap: 'wrap',
};

const smallInput: React.CSSProperties = {
  padding: '9px 10px',
  borderRadius: 12,
  fontSize: 13,
};

const smallBtn: React.CSSProperties = {
  padding: '9px 10px',
  borderRadius: 12,
  fontSize: 13,
  fontWeight: 900,
  border: '1px solid #0000FF',
  color: '#0000FF',
  background: '#FFFFFF',
};

/* ---------- Table ---------- */
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
  borderBottom: '1px solid rgba(10,10,10,0.08)',
};

const th: React.CSSProperties = thBase;

const tdBase: React.CSSProperties = {
  padding: '8px 6px',
  whiteSpace: 'nowrap',
  fontSize: 13,
  background: '#FFFFFF',
  color: '#0A0A0A',
  textAlign: 'center',
  fontWeight: 900,
};

/* Sticky: ONLY Rank + User + Total */
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

const thStickyTotal: React.CSSProperties = {
  ...thBase,
  position: 'sticky',
  left: COL_RANK + COL_USER,
  zIndex: 5,
};

const tdStickyRank: React.CSSProperties = {
  ...tdBase,
  position: 'sticky',
  left: 0,
  zIndex: 4,
  background: '#A5D2FF',
  color: '#0000FF',
};

const tdStickyUser: React.CSSProperties = {
  ...tdBase,
  position: 'sticky',
  left: COL_RANK,
  zIndex: 4,
  background: '#FFFFFF',
};

const tdStickyTotal: React.CSSProperties = {
  ...tdBase,
  position: 'sticky',
  left: COL_RANK + COL_USER,
  zIndex: 4,
  background: '#FFFFFF',
};

const td: React.CSSProperties = tdBase;
