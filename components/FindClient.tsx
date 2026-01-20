'use client';

import React, { useState } from 'react';

function isAddressLike(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s.trim());
}

export default function FindClient() {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function go() {
    const v = value.trim();
    if (!isAddressLike(v)) {
      setError('Please enter a valid 0x address (40 hex characters).');
      return;
    }
    setError(null);
    window.location.href = '/find/' + v;
  }

  return (
    <div>
      <div className="row">
        <input
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0x1234..."
        />

        <button type="button" onClick={go} className="btn">
          Open
        </button>
      </div>

      {error ? (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <span style={{ fontWeight: 900 }}>Error:</span> {error}
        </div>
      ) : null}

      <div style={{ marginTop: 12 }} className="subtle">
        Tip: you can also click any address from Weekly or All-time tables.
      </div>
    </div>
  );
}
