'use client';

import { useEffect } from 'react';
import { sdk as farcasterSdk } from '@farcaster/miniapp-sdk';
import { useMiniKit } from '@coinbase/onchainkit/minikit';

/**
 * Base.dev preview + Farcaster Mini Apps require sdk.actions.ready()
 * to dismiss the splash screen.
 *
 * We also call MiniKit readiness (best-effort) for Base App runtime.
 */
export default function FrameReady() {
  const minikit = useMiniKit();

  useEffect(() => {
    // 1) Farcaster/Base preview readiness (the critical one)
    (async () => {
      try {
        await farcasterSdk.actions.ready();
      } catch {
        // If running outside the miniapp runtime, ignore.
      }
    })();

    // 2) MiniKit readiness (best-effort; API can vary by version)
    const mk = minikit as unknown as {
      setFrameReady?: () => void;
      ready?: () => void;
    };

    try {
      if (typeof mk.setFrameReady === 'function') mk.setFrameReady();
      if (typeof mk.ready === 'function') mk.ready();
    } catch {
      // ignore
    }
  }, [minikit]);

  return null;
}
