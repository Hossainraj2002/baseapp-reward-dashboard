'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { useMiniKit } from '@coinbase/onchainkit/minikit';
import { Wallet, ConnectWallet, WalletDropdown } from '@coinbase/onchainkit/wallet';
import { Identity, Avatar, Name, Address } from '@coinbase/onchainkit/identity';

import { useAccount } from 'wagmi';
import CopyButton from '@/components/CopyButton';
import ProfileView from '@/components/ProfileView';

type ProfilePayload = {
  address: string;
  farcaster: null | {
    fid: number;
    username: string;
    pfp_url: string | null;
  };
  reward_summary: {
    all_time_usdc: number;
    total_weeks_earned: number;
    latest_week_usdc: number;
    latest_week_start_utc: string;
    latest_week_label: string;
    previous_week_usdc: number;
    previous_week_start_utc: string | null;
    previous_week_label: string | null;
    pct_change: string | null;
  };
  reward_history: Array<{
    week_start_utc: string;
    week_label: string;
    week_number: number;
    usdc: number;
  }>;
  meta: {
    created_by: string;
    support_address: string;
  };
};

type ProfileApiResponse = ProfilePayload | { error: string };

function isEvmAddress(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

function pickContextAddress(
  context: unknown
): string | null {
  const ctx = context as {
    user?: {
      verified_addresses?: { eth_addresses?: string[] };
      custody_address?: string;
      address?: string;
      walletAddress?: string;
      connectedAddress?: string;
    };
  };

  const candidates = [
    ctx?.user?.verified_addresses?.eth_addresses?.[0],
    ctx?.user?.custody_address,
    ctx?.user?.address,
    ctx?.user?.walletAddress,
    ctx?.user?.connectedAddress,
  ].filter(Boolean) as string[];

  const addr = candidates.find((v) => isEvmAddress(v));
  return addr ?? null;
}

export default function ProfileConnectedClient() {
  const { context } = useMiniKit();
  const { address: wagmiAddress, isConnected } = useAccount();

  // We still “use” MiniKit identity under the hood (FID / context),
  // but we do NOT show it as a big section in UI.
  const contextAddress = useMemo(() => pickContextAddress(context), [context]);

  const [manualAddress, setManualAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ProfileApiResponse | null>(null);

  const activeAddress = useMemo(() => {
    if (isConnected && wagmiAddress) return wagmiAddress;
    if (contextAddress) return contextAddress;
    const m = manualAddress.trim();
    return isEvmAddress(m) ? (m as `0x${string}`) : null;
  }, [isConnected, wagmiAddress, contextAddress, manualAddress]);

  async function loadProfile(addr: string) {
    setLoading(true);
    setData(null);
    try {
      const res = await fetch(`/api/profile?address=${encodeURIComponent(addr)}`, { cache: 'no-store' });
      const json = (await res.json()) as ProfileApiResponse;
      setData(json);
    } catch {
      setData({ error: 'Failed to load profile' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeAddress) loadProfile(activeAddress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAddress]);

  const showManualInput = !activeAddress; // if nothing detected, show paste box

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <h1 style={{ margin: 0 }}>Profile</h1>
        <Link href="/find" className="btn">
          Find
        </Link>
      </div>

      {/* Identity / address card */}
      <div className="card card-pad" style={{ marginTop: 12 }}>
        <div className="subtle" style={{ marginBottom: 8 }}>
          Your address
        </div>

        {activeAddress ? (
          <>
            <Identity address={activeAddress as `0x${string}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900 }}>
                    <Name />
                  </div>
                  <div className="subtle" style={{ marginTop: 2 }}>
                    <Address />
                  </div>
                </div>
              </div>
            </Identity>

            {/* Full address + copy */}
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                justifyContent: 'space-between',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 900, wordBreak: 'break-all', color: '#0A0A0A' }}>
                {activeAddress}
              </div>
              <CopyButton value={activeAddress} mode="icon" />
            </div>
          </>
        ) : (
          <div className="subtle">
            Wallet not detected yet. Paste an address below to view stats.
          </div>
        )}
      </div>

      {/* Wallet connect (small + optional, not a big section) */}
      <div style={{ marginTop: 10 }}>
        <Wallet>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <ConnectWallet className="btn" />
            <WalletDropdown />
          </div>
        </Wallet>
      </div>

      {/* Manual address fallback (only when nothing detected) */}
      {showManualInput ? (
        <div className="card card-pad" style={{ marginTop: 12, border: '2px solid #0000FF' }}>
          <div style={{ fontWeight: 900 }}>Paste address</div>
          <div className="subtle" style={{ marginTop: 6 }}>
            If wallet popups are blocked inside Base App, this always works.
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              value={manualAddress}
              onChange={(e) => setManualAddress(e.target.value)}
              placeholder="0x..."
              style={{
                flex: 1,
                border: '1px solid rgba(10,10,10,0.2)',
                borderRadius: 12,
                padding: '10px 12px',
                fontWeight: 800,
              }}
            />
            <button
              className="btn"
              onClick={() => {
                const m = manualAddress.trim();
                if (isEvmAddress(m)) loadProfile(m);
                else setData({ error: 'Invalid address. Expected 0x...' });
              }}
            >
              Load
            </button>
          </div>
        </div>
      ) : null}

      {/* Data */}
      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div className="card card-pad">Loading…</div>
        ) : data && 'error' in data ? (
          <div className="card card-pad" style={{ border: '2px solid #0000FF' }}>
            <div style={{ fontWeight: 900 }}>Failed to load profile</div>
            <div className="subtle" style={{ marginTop: 6 }}>{data.error}</div>
          </div>
        ) : data && !('error' in data) ? (
          <>
            {/* Reuse same proven layout used by Find /address */}
            <ProfileView data={data} showBackLink={false} />
            <div style={{ marginTop: 12 }}>
              <Link className="btn" href={`/find/${encodeURIComponent(data.address)}`}>
                Open in Find
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
