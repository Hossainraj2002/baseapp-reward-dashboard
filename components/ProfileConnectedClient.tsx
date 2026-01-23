'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMiniKit } from '@coinbase/onchainkit/minikit';
import { Identity, Avatar, Name, Address } from '@coinbase/onchainkit/identity';

type ProfileApiResponse =
  | {
      address: string;
      allTime: { total_usdc: string; rank: number | null; weeks_earned: number };
      latestWeek: { week_start_utc: string; amount_usdc: string; rank: number | null };
    }
  | { error: string };

function pickWalletAddressFromContext(ctx: any): string | null {
  const candidates = [
    ctx?.user?.address,
    ctx?.user?.walletAddress,
    ctx?.user?.custodyAddress,
    ctx?.user?.verifiedAddress,
    ctx?.user?.connectedAddress,
  ].filter(Boolean);

  const addr = candidates.find((v: string) => /^0x[a-fA-F0-9]{40}$/.test(v));
  return addr || null;
}

export default function ProfileConnectedClient() {
  const { context } = useMiniKit();
  const [manualAddress, setManualAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ProfileApiResponse | null>(null);

  const connectedAddress = useMemo(() => pickWalletAddressFromContext(context as any), [context]);

  async function loadProfile(address: string) {
    setLoading(true);
    setData(null);
    try {
      const res = await fetch(`/api/profile?address=${encodeURIComponent(address)}`, { cache: 'no-store' });
      const json = (await res.json()) as ProfileApiResponse;
      setData(json);
    } catch {
      setData({ error: 'Failed to load profile' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (connectedAddress) loadProfile(connectedAddress);
  }, [connectedAddress]);

  const addressToShow = connectedAddress || manualAddress.trim();

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <h1 style={{ margin: 0 }}>Profile</h1>
        <Link href="/find" className="btn">
          Find
        </Link>
      </div>

      {/* If Base App doesn't provide wallet address yet, allow manual */}
      {!connectedAddress ? (
        <div className="card card-pad" style={{ marginTop: 12, border: '2px solid #0000FF' }}>
          <div style={{ fontWeight: 900 }}>Wallet not detected</div>
          <div className="subtle" style={{ marginTop: 6 }}>
            Base App MiniKit context did not provide an address on this device. You can paste an address to view stats.
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
                if (/^0x[a-fA-F0-9]{40}$/.test(manualAddress.trim())) loadProfile(manualAddress.trim());
                else setData({ error: 'Invalid address. Expected 0x...' });
              }}
            >
              Load
            </button>
          </div>
        </div>
      ) : (
        <div className="card card-pad" style={{ marginTop: 12 }}>
          <div className="subtle" style={{ marginBottom: 8 }}>Connected</div>
          <Identity address={connectedAddress as `0x${string}`}>
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
        </div>
      )}

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
          <div className="card card-pad">
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Stats</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ borderRadius: 14, padding: 12, background: '#0000FF', color: '#fff', fontWeight: 900 }}>
                <div style={{ fontSize: 12, opacity: 0.95 }}>All-time USDC</div>
                <div style={{ fontSize: 18 }}>${Number(data.allTime.total_usdc).toLocaleString()}</div>
              </div>

              <div style={{ borderRadius: 14, padding: 12, background: '#0000FF', color: '#fff', fontWeight: 900 }}>
                <div style={{ fontSize: 12, opacity: 0.95 }}>Weeks earned</div>
                <div style={{ fontSize: 18 }}>{data.allTime.weeks_earned}</div>
              </div>
            </div>

            <div style={{ marginTop: 12 }} className="subtle">
              Latest week: <span style={{ fontWeight: 900, color: '#0A0A0A' }}>{data.latestWeek.week_start_utc}</span> —{' '}
              <span style={{ fontWeight: 900, color: '#0A0A0A' }}>${Number(data.latestWeek.amount_usdc).toLocaleString()}</span>
            </div>

            <div style={{ marginTop: 12 }}>
              <Link className="btn" href={`/find/${encodeURIComponent(addressToShow)}`}>
                Open in Find
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
