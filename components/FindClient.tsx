'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function isEvmAddress(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

export default function FindClient() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function go() {
    const addr = value.trim();
    if (!isEvmAddress(addr)) {
      setError('Invalid address. Must be 0x...');
      return;
    }
    setError(null);
    router.push(`/find/${encodeURIComponent(addr)}`);
  }

  return (
    <div className="card card-pad">
      <div style={{ fontSize: 14, fontWeight: 900, color: '#0000FF' }}>Find by address</div>

      <div className="subtle" style={{ marginTop: 6 }}>
        Paste a Base (EVM) address to view rewards profile.
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0x..."
          style={{
            flex: 1,
            border: '1px solid rgba(10,10,10,0.2)',
            borderRadius: 12,
            padding: '10px 12px',
            fontWeight: 800,
          }}
        />
        <button className="btn" onClick={go}>
          Search
        </button>
      </div>

      {error ? (
        <div className="subtle" style={{ marginTop: 10, color: '#6B7280' }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
