"use client";

import { useEffect, useState } from "react";

export default function Debug() {
  const [info, setInfo] = useState<any>({});

  useEffect(() => {
    (async () => {
      try {
        const mod = await import("@farcaster/miniapp-sdk");
        const sdk = (mod as any).sdk;

        setInfo({
          hasSdk: Boolean(sdk),
          hasReady: Boolean(sdk?.actions?.ready),
          keys: sdk ? Object.keys(sdk) : [],
        });
      } catch (e: any) {
        setInfo({ error: e?.message ?? "import failed" });
      }
    })();
  }, []);

  return (
    <pre style={{ padding: 16, whiteSpace: "pre-wrap" }}>
      {JSON.stringify(info, null, 2)}
    </pre>
  );
}
