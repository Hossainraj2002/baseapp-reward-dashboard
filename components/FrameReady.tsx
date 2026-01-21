'use client';

import { useEffect } from 'react';

type MiniKitLike = { ready?: () => Promise<void> | void };

function getMiniKitFromWindow(): MiniKitLike | null {
  const w = window as unknown as Record<string, unknown>;

  // Common places MiniKit can exist
  const candidates = [
    w.MiniKit,
    w.miniKit,
    (w.onchainkit as any)?.minikit,
    (w.onchainKit as any)?.minikit,
  ];

  for (const c of candidates) {
    if (c && typeof c === 'object' && typeof (c as MiniKitLike).ready === 'function') {
      return c as MiniKitLike;
    }
  }
  return null;
}

export default function FrameReady() {
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        console.log('[FrameReady] attempting ready()');

        // 1) Try window first
        const fromWindow = getMiniKitFromWindow();
        if (fromWindow?.ready) {
          await fromWindow.ready();
          if (!cancelled) console.log('[FrameReady] ready() success via window');
          return;
        }

        // 2) Try importing MiniKit directly
        const mod = (await import('@coinbase/onchainkit/minikit')) as unknown as {
          MiniKit?: { ready?: () => Promise<void> | void };
        };

        if (mod?.MiniKit?.ready) {
          await mod.MiniKit.ready();
          if (!cancelled) console.log('[FrameReady] ready() success via import');
          return;
        }

        console.warn('[FrameReady] MiniKit.ready not found (window/import)');
      } catch (e) {
        console.error('[FrameReady] ready() failed', e);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
