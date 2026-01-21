'use client';

import { OnchainKitProvider } from '@coinbase/onchainkit';
import { base } from 'wagmi/chains';
import type { ReactNode } from 'react';

export default function RootProvider({ children }: { children: ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY ?? '';
  const projectName = process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME ?? 'Baseapp Reward Dashboard';
  const iconUrl = process.env.NEXT_PUBLIC_ICON_URL ?? '';

  return (
    <OnchainKitProvider
      apiKey={apiKey}
      chain={base}
      config={{
        appearance: {
          mode: 'auto',
          theme: 'default',
          name: projectName,
          logo: iconUrl,
        },
      }}
      miniKit={{ enabled: true }}
    >
      {children}
    </OnchainKitProvider>
  );
}
