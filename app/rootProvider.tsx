'use client';

import React from 'react';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { base } from 'viem/chains';

import BottomNav from '@/components/BottomNav';

export default function RootProvider({ children }: { children: React.ReactNode }) {
  return (
    <OnchainKitProvider
      chain={base}
      // MiniKit hooks (useMiniKit, ready) require this enabled flag.
      // No API key required for basic MiniKit operation.
      miniKit={{ enabled: true }}
      // Do NOT add unsupported props like `wallet` here.
      // OnchainKit wallet behavior is configured under `config` (optional).
    >
      <div style={{ minHeight: '100vh', background: '#ffffff' }}>
        <div
          style={{
            maxWidth: 420,
            margin: '0 auto',
            paddingBottom: 96, // space for bottom nav
          }}
        >
          {children}
        </div>

        <BottomNav />
      </div>
    </OnchainKitProvider>
  );
}
