'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { useMiniKit } from '@coinbase/onchainkit/minikit';
import { useAuthenticate } from '@coinbase/onchainkit/minikit';

import { Wallet, ConnectWallet, WalletDropdown } from '@coinbase/onchainkit/wallet';
import { Identity, Avatar, Name, Address } from '@coinbase/onchainkit/identity';
import { useAccount } from 'wagmi';

type ProfileApiResponse =
  | {
      address: string;
      allTime: { total_usdc: string; rank: number | null; weeks_earned: number };
      latestWeek: { week_start_utc: string; amount_usdc: string; rank: number | null };
    }
  | { error: string };

type MiniKitContextShape = {
  user?: {
    fid?: string | number;
    verified_addresses?: { eth_addresses?: string[] };
    custody_address?: string;
  };
};

function isEvmAddress(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

function pickAddressFromMiniKit(ctx: MiniKitContextShape): string | null {
  const fromVerified = ctx.user?.verified_addresses?.eth_addresses?.[0];
  if (typeof fromVerified === 'string' && isEvmAddress(fromVerified)) return fromVerified;

  const fromCustody = ctx.user?.custody_address;
  if (typeof fromCustody === 'string' && isEvmAddress(fromCustody)) return fromCustody;

  return null;
}

export default function ProfileConnectedClient() {
  const { context } = useMiniKit();

  const ctx = context as unknown as MiniKitContextShape;

  const fid = useMemo(() => {
    const raw = ctx.user?.fid;
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [ctx.user?.fid]);

  // Installed OnchainKit version: hook exposes signIn()
  const { signIn } = useAuthenticate();
  const [authMsg, setAuthMsg] = useState<string>('');

  // Wallet connection (real wallet connect UI)
  const { address: wagmiAddress, isConnected } = useAccount();

  // Fallback address from MiniKit context (old-project style)
  const miniKitAddress = useMemo(() => pickAddressFromMiniKit(ctx), [ctx]);

  const [manualAddress, setManualAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ProfileApiResponse | null>(null);

  const addressToQuery = useMemo(() => {
    if (isConnected && wagmiAddress && isEvmAddress(wagmiAddress)) return wagmiAddress;
    if (miniKitAddress) return miniKitAddress;
    const m = manualAddress.trim();
    return isEvmAddress(m) ? (m as `0x${string}`) : null;
  }, [isConnected, wagmiAddress, miniKitAddress, manualAddress]);

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
        <Link href="/find" className="btn">Find</Link>
      </div>

      {/* MiniKit identity */}
      <div className="card card-pad" style={{ marginTop: 12 }}>
        <div className="subtle" style={{ marginBottom: 8 }}>MiniKit identity</div>
        <div style={{ fontWeight: 900 }}>{fid ? `FID: ${fid}` : 'FID not available on this device'}</div>

        <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            className="btn"
            onClick={async () => {
              setAuthMsg('');
              try {
                const result = await signIn();
                if (result === false) setAuthMsg('Verification cancelled or not supported on this device.');
                else setAuthMsg('Verified successfully.');
              } catch (e) {
                setAuthMsg(`Verify error: ${String(e)}`);
              }
            }}
          >
            Verify (recommended)
          </button>

          {authMsg ? <div className="subtle" style={{ color: '#6B7280' }}>{authMsg}</div> : null}
        </div>
      </div>

      {/* Wallet */}
      <div className="card card-pad" style={{ marginTop: 12, border: '2px solid #0000FF' }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Wallet</div>

        <Wallet>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <ConnectWallet className="btn" />
            <WalletDropdown />
          </div>
        </Wallet>

        {isConnected && wagmiAddress ? (
          <div style={{ marginTop: 12 }}>
            <div className="subtle" style={{ marginBottom: 6 }}>Connected address</div>
            <Identity address={wagmiAddress}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900 }}><Name /></div>
                  <div className="subtle" style={{ marginTop: 2 }}><Address /></div>
                </div>
              </div>
            </Identity>
          </div>
        ) : miniKitAddress ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900 }}>Detected from MiniKit context</div>
            <div className="subtle" style={{ marginTop: 6, wordBreak: 'break-all' }}>{miniKitAddress}</div>
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900 }}>No wallet detected</div>
            <div className="subtle" style={{ marginTop: 6 }}>
              If wallet connect is blocked on this device, paste an address below.
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
        )}
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
                <div style={{ fontSize: 18 }}>${Number(data.allTime.total_usdc).toLocaleString()}</div>
              </div>

              <div style={{ borderRadius: 14, padding: 12, background: '#0000FF', color: '#fff', fontWeight: 900 }}>
                <div style={{ fontSize: 12, opacity: 0.95 }}>Weeks earned</div>
                <div style={{ fontSize: 18 }}>{data.allTime.weeks_earned}</div>
              </div>
            </div>

            <div style={{ marginTop: 12 }} className="subtle">
              Latest week:{' '}
              <span style={{ fontWeight: 900, color: '#0A0A0A' }}>{data.latestWeek.week_start_utc}</span> —{' '}
              <span style={{ fontWeight: 900, color: '#0A0A0A' }}>
                ${Number(data.latestWeek.amount_usdc).toLocaleString()}
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
