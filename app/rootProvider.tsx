'use client';

import React from 'react';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { base } from 'viem/chains';
import BottomNav from '@/components/BottomNav';

export default function RootProvider({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY ?? '';

  return (
    <OnchainKitProvider apiKey={apiKey} chain={base} miniKit={{ enabled: true }}>
      <div style={{ minHeight: '100vh', background: '#ffffff' }}>
        <div style={{ maxWidth: 420, margin: '0 auto', paddingBottom: 96 }}>
          {children}
        </div>

        <BottomNav />
      </div>
    </OnchainKitProvider>
  );
}
