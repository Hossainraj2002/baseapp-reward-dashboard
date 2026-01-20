'use client';

import React from 'react';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { base } from 'viem/chains';

import BottomNav from '@/components/BottomNav';

export default function RootProvider({ children }: { children: React.ReactNode }) {
  return (
    <OnchainKitProvider
      chain={base}
      miniKit={{ enabled: true }}
      // No apiKey needed for MiniKit hooks like useMiniKit/ready.
      // We are keeping this FREE-only and stable.
    >
      <div
        style={{
          minHeight: '100vh',
          background: '#ffffff',
        }}
      >
        {/* Mobile-first app container */}
        <div
          style={{
            maxWidth: 420,
            margin: '0 auto',
            paddingBottom: 96, // space for bottom nav
          }}
        >
          {children}
        </div>

        {/* Always-on bottom navigation */}
        <BottomNav />
      </div>
    </OnchainKitProvider>
  );
}
