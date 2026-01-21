'use client';

import { useEffect } from 'react';
import { useMiniKit } from '@coinbase/onchainkit/minikit';

/**
 * Base.dev preview (and Base app) expects the Mini App to signal "ready".
 * OnchainKit versions can expose different APIs, so we call all known variants safely.
 */
export default function FrameReady() {
  const mini = useMiniKit();

  useEffect(() => {
    try {
      // Variant A (older templates)
      const setFrameReady = (mini as unknown as { setFrameReady?: () => void }).setFrameReady;
      if (typeof setFrameReady === 'function') setFrameReady();

      // Variant B (some builds expose ready directly)
      const readyDirect = (mini as unknown as { ready?: () => void }).ready;
      if (typeof readyDirect === 'function') readyDirect();

      // Variant C (nested miniKit object)
      const readyNested = (mini as unknown as { miniKit?: { ready?: () => void } }).miniKit?.ready;
      if (typeof readyNested === 'function') readyNested();

      // Helpful log for Base.dev console
      // (You should see this log once the app loads)
      // eslint-disable-next-line no-console
      console.log('[FrameReady] ready() called');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[FrameReady] ready() failed', e);
    }
  }, [mini]);

  return null;
}
