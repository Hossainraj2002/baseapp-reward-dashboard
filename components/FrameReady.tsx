'use client';

import { useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

/**
 * Critical: dismiss Base.dev / Farcaster miniapp splash screen.
 * Must NOT depend on MiniKit provider or any other context.
 */
export default function FrameReady() {
  useEffect(() => {
    let cancelled = false;

    async function markReady() {
      try {
        // Call ASAP
        await sdk.actions.ready();
      } catch {
        // If not inside miniapp runtime, ignore.
      }

      // Extra safety: call again on next tick (some runtimes are picky)
      if (!cancelled) {
        setTimeout(() => {
          sdk.actions.ready().catch(() => {});
        }, 50);
      }
    }

    markReady();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
