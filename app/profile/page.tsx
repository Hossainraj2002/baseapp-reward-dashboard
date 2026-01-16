"use client";

import { useMemo } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import ProfileView from "../_components/ProfileView";

export default function ProfilePage() {
  const { context } = useMiniKit();

  const address = useMemo(() => {
    const a =
      (context as any)?.user?.verified_addresses?.eth_addresses?.[0] ||
      (context as any)?.user?.custody_address ||
      null;

    return typeof a === "string" ? a : null;
  }, [context]);

  const fid = useMemo(() => {
    const raw = (context as any)?.user?.fid;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  }, [context]);

  return <ProfileView mode="viewer" address={address} viewerFid={fid} />;
}
