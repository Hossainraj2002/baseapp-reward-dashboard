'use client';

import { ReactNode } from 'react';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { base } from 'viem/chains';

export default function RootProvider({ children }: { children: ReactNode }) {
  // IMPORTANT:
  // Your repo uses NEXT_PUBLIC_ONCHAINKIT_API_KEY in .env
  // If you read the wrong env var, MiniKit won't initialize and base.dev stays "Not Ready".
  const apiKey =
    process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY ||
    process.env.NEXT_PUBLIC_CDP_CLIENT_API_KEY ||
    '';

  return (
    <OnchainKitProvider
      apiKey={apiKey}
      chain={base}
      // This is the critical part for Base Mini App viewer readiness
      miniKit={{
        enabled: true,
        autoConnect: true,
      }}
    >
      {children}
    </OnchainKitProvider>
  );
}
