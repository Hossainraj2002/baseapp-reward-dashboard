'use client';

import { useEffect } from 'react';

type ReadyFn = () => Promise<void> | void;

// We keep it strict: no `any`, no unsafe casts.
type MiniKitCandidate = { ready?: ReadyFn };

type WindowWithMiniKit = Window &
  typeof globalThis & {
    MiniKit?: MiniKitCandidate;
    miniKit?: MiniKitCandidate;
    onchainkit?: { minikit?: MiniKitCandidate };
    onchainKit?: { minikit?: MiniKitCandidate };
  };

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function hasReady(x: unknown): x is MiniKitCandidate {
  return isObject(x) && typeof (x as { ready?: unknown }).ready === 'function';
}

function getMiniKitFromWindow(): MiniKitCandidate | null {
  const w = window as WindowWithMiniKit;

  const candidates: unknown[] = [
    w.MiniKit,
    w.miniKit,
    w.onchainkit?.minikit,
    w.onchainKit?.minikit,
  ];

  for (const c of candidates) {
    if (hasReady(c)) return c;
  }
  return null;
}

export default function FrameReady() {
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // 1) Try window
        const fromWindow = getMiniKitFromWindow();
        if (fromWindow?.ready) {
          console.log('[FrameReady] calling ready() via window');
          await fromWindow.ready();
          if (!cancelled) console.log('[FrameReady] ready() success via window');
          return;
        }

        // 2) Try importing MiniKit directly
        console.log('[FrameReady] importing MiniKit for ready()');
        const mod = (await import('@coinbase/onchainkit/minikit')) as unknown;

        const maybe = isObject(mod) ? (mod as Record<string, unknown>).MiniKit : undefined;
        if (hasReady(maybe)) {
          console.log('[FrameReady] calling ready() via import');
          await maybe.ready?.();
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
