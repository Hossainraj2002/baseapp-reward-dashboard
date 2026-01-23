'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function FindClient() {
  const router = useRouter();
  const [address, setAddress] = useState('');

  function handleGo() {
    const trimmed = address.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return;
    router.push(`/find/${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="card card-pad" style={{ border: '2px solid #0000FF' }}>
      <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 8 }}>Search by address</div>

      <input
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="0x..."
        style={{
          width: '100%',
          border: '1px solid rgba(10,10,10,0.2)',
          borderRadius: 12,
          padding: '10px 12px',
          fontWeight: 800,
        }}
      />

      <button className="btn" style={{ marginTop: 10, width: '100%' }} onClick={handleGo}>
        Find
      </button>
    </div>
  );
}
