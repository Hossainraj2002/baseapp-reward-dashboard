"use client";

import { useEffect } from "react";

export default function MiniKitReady() {
  useEffect(() => {
    let cancelled = false;
    let done = false;

    const run = async () => {
      const maxTries = 20;

      for (let i = 0; i < maxTries; i++) {
        if (cancelled || done) return;

        try {
          const mod = await import("@farcaster/miniapp-sdk");
          const sdk = (mod as any).sdk;

          if (sdk?.actions?.ready) {
            await sdk.actions.ready();
            done = true;
            return;
          }
        } catch {
          // ignore
        }

        // wait a bit then retry
        await new Promise((r) => setTimeout(r, 250));
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
