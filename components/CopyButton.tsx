'use client';

import { useState } from 'react';

type Props = {
  value: string;
  label?: string; // used in "button" mode
  mode?: 'button' | 'icon'; // NEW
};

export default function CopyButton({ value, label = 'Copy', mode = 'button' }: Props) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  // Icon-only mode (for address rows)
  if (mode === 'icon') {
    return (
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? 'Copied' : 'Copy address'}
        title={copied ? 'Copied' : 'Copy'}
        style={{
          border: '1px solid #0000FF',
          borderRadius: 10,
          width: 40,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          background: '#FFFFFF',
          color: '#0000FF',
          flex: '0 0 auto',
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    );
  }

  // Default full-width button mode (keeps old pages working)
  return (
    <button
      type="button"
      onClick={onCopy}
      style={{
        border: '1px solid rgba(10,10,10,0.16)',
        borderRadius: 12,
        padding: '12px 12px',
        fontSize: 14,
        fontWeight: 900,
        width: '100%',
        cursor: 'pointer',
        background: '#FFFFFF',
        color: '#0000FF',
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 9h10v12H9V9Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 6L9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
