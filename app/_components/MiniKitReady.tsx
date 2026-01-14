"use client";

import { useEffect } from "react";

export default function MiniKitReady() {
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // Dynamically import so it never runs on the server
        const mod = await import("@farcaster/miniapp-sdk");
        const sdk: any = (mod as any).default ?? mod;

        // Some SDK builds expose actions under sdk.actions
        // We guard to avoid crashing if running in normal browser.
        if (!cancelled && sdk?.actions?.ready) {
          await sdk.actions.ready();
        }
      } catch {
        // Ignore in normal web browsers
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
