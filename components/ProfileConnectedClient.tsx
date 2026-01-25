'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { Wallet, ConnectWallet, WalletDropdown } from '@coinbase/onchainkit/wallet';
import { useAccount } from 'wagmi';
import { useMiniKit } from '@coinbase/onchainkit/minikit';

import type { ProfilePayload } from '@/lib/profilePayload';

type ProfileApiResponse = ProfilePayload | { error: string };

function isEvmAddress(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

export default function ProfileConnectedClient() {
  const { context } = useMiniKit();
  const fid = useMemo(() => {
    const raw = (context as unknown as { user?: { fid?: string | number } })?.user?.fid;
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [context]);

  const { address, isConnected } = useAccount();

  const [manualAddress, setManualAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ProfileApiResponse | null>(null);

  const addressToQuery = useMemo(() => {
    if (isConnected && address) return address;
    const m = manualAddress.trim();
    return isEvmAddress(m) ? (m as `0x${string}`) : null;
  }, [isConnected, address, manualAddress]);

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
    if (addressToQuery) loadProfile(addressToQuery);
  }, [addressToQuery]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <h1 style={{ margin: 0 }}>Profile</h1>
        <Link href="/find" className="btn">
          Find
        </Link>
      </div>

      {/* MiniKit identity (FID) */}
      <div className="card card-pad" style={{ marginTop: 12 }}>
        <div className="subtle" style={{ marginBottom: 8 }}>
          MiniKit identity (FID)
        </div>
        <div style={{ fontWeight: 900 }}>{fid ? `FID: ${fid}` : 'FID not available on this device'}</div>
        <div className="subtle" style={{ marginTop: 6 }}>
          We will use FID later to fetch social data via Neynar. Wallet address alone is not enough for Farcaster profile.
        </div>
      </div>

      {/* Wallet connect */}
      <div className="card card-pad" style={{ marginTop: 12, border: '2px solid #0000FF' }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Wallet</div>

        <Wallet>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <ConnectWallet className="btn" />
            <WalletDropdown />
          </div>
        </Wallet>

        {/* Base App may block popups → manual is prominent */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 900 }}>{isConnected && address ? 'Connected' : 'Wallet not connected'}</div>
          <div className="subtle" style={{ marginTop: 6 }}>
            If wallet connect popups are blocked inside Base App, paste your address here to view stats.
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

          {isConnected && address ? (
            <div className="subtle" style={{ marginTop: 10 }}>
              Connected address: <span style={{ fontWeight: 900, color: '#0A0A0A' }}>{address}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Stats */}
      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div className="card card-pad">Loading…</div>
        ) : data && 'error' in data ? (
          <div className="card card-pad" style={{ border: '2px solid #0000FF' }}>
            <div style={{ fontWeight: 900 }}>Failed to load profile</div>
            <div className="subtle" style={{ marginTop: 6 }}>{data.error}</div>
          </div>
        ) : data && !('error' in data) ? (
          <div className="card card-pad">
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Stats</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ borderRadius: 14, padding: 12, background: '#0000FF', color: '#fff', fontWeight: 900 }}>
                <div style={{ fontSize: 12, opacity: 0.95 }}>All-time USDC</div>
                <div style={{ fontSize: 18 }}>${data.reward_summary.all_time_usdc.toLocaleString()}</div>
              </div>

              <div style={{ borderRadius: 14, padding: 12, background: '#0000FF', color: '#fff', fontWeight: 900 }}>
                <div style={{ fontSize: 12, opacity: 0.95 }}>Weeks earned</div>
                <div style={{ fontSize: 18 }}>{data.reward_summary.total_weeks_earned}</div>
              </div>
            </div>

            <div style={{ marginTop: 12 }} className="subtle">
              Latest week:{' '}
              <span style={{ fontWeight: 900, color: '#0A0A0A' }}>{data.reward_summary.latest_week_label}</span> —{' '}
              <span style={{ fontWeight: 900, color: '#0A0A0A' }}>
                ${data.reward_summary.latest_week_usdc.toLocaleString()}
              </span>
            </div>

            <div style={{ marginTop: 12 }}>
              <Link className="btn" href={`/find/${encodeURIComponent(data.address)}`}>
                Open in Find
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
