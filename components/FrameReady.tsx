'use client';

import { useEffect, useRef } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

export default function FrameReady() {
  const did = useRef(false);

  useEffect(() => {
    if (did.current) return;
    did.current = true;

    try {
      sdk.actions.ready();
    } catch {
      // Ignore when running outside the miniapp runtime.
    }
  }, []);

  return null;
}
