'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMiniKit } from '@coinbase/onchainkit/minikit';
import { Identity, Avatar, Name, Address } from '@coinbase/onchainkit/identity';

/**
 * API payload returned by /api/profile
 */
type ProfileOk = {
  address: string;
  allTime: { total_usdc: string; rank: number | null; weeks_earned: number };
  latestWeek: { week_start_utc: string; amount_usdc: string; rank: number | null };
};

type ProfileErr = { error: string };

type ProfileApiResponse = ProfileOk | ProfileErr;

/**
 * Safe helpers for reading unknown nested objects.
 */
type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

function getNestedString(obj: unknown, path: string[]): string | null {
  let cur: unknown = obj;
  for (const key of path) {
    if (!isRecord(cur)) return null;
    cur = cur[key];
  }
  return typeof cur === 'string' ? cur : null;
}

function isEvmAddress(v: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(v);
}

/**
 * Try to read a wallet address from MiniKit context, across common key variations.
 * Note: context shape can vary across versions/clients, so we treat it as unknown.
 */
function pickWalletAddressFromContext(ctx: unknown): string | null {
  const candidates: Array<string | null> = [
    getNestedString(ctx, ['user', 'address']),
    getNestedString(ctx, ['user', 'walletAddress']),
    getNestedString(ctx, ['user', 'custodyAddress']),
    getNestedString(ctx, ['user', 'verifiedAddress']),
    getNestedString(ctx, ['user', 'connectedAddress']),
    // Some clients may nest differently
    getNestedString(ctx, ['interactor', 'address']),
    getNestedString(ctx, ['viewer', 'address']),
  ];

  const addr = candidates.find((v): v is string => typeof v === 'string' && isEvmAddress(v));
  return addr ?? null;
}

function formatNumberString(n: string): string {
  const val = Number(n);
  if (!Number.isFinite(val)) return n;
  return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function ProfileConnectedClient() {
  const { context } = useMiniKit();

  const [manualAddress, setManualAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ProfileApiResponse | null>(null);

  const connectedAddress = useMemo(() => pickWalletAddressFromContext(context), [context]);

  async function loadProfile(address: string) {
    setLoading(true);
    setData(null);

    try {
      const res = await fetch(`/api/profile?address=${encodeURIComponent(address)}`, { cache: 'no-store' });
      const json = (await res.json()) as unknown;

      // Basic runtime validation
      if (isRecord(json) && typeof json.error === 'string') {
        setData({ error: json.error });
      } else if (
        isRecord(json) &&
        typeof json.address === 'string' &&
        isRecord(json.allTime) &&
        typeof json.allTime.total_usdc === 'string' &&
        typeof json.allTime.weeks_earned === 'number' &&
        isRecord(json.latestWeek) &&
        typeof json.latestWeek.week_start_utc === 'string' &&
        typeof json.latestWeek.amount_usdc === 'string'
      ) {
        setData(json as ProfileOk);
      } else {
        setData({ error: 'Unexpected API response shape' });
      }
    } catch {
      setData({ error: 'Failed to load profile' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (connectedAddress) loadProfile(connectedAddress);
    // intentionally only when address changes
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
                const trimmed = manualAddress.trim();
                if (isEvmAddress(trimmed)) loadProfile(trimmed);
                else setData({ error: 'Invalid address. Expected 0x...' });
              }}
            >
              Load
            </button>
          </div>
        </div>
      ) : (
        <div className="card card-pad" style={{ marginTop: 12 }}>
          <div className="subtle" style={{ marginBottom: 8 }}>
            Connected
          </div>
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
            <div className="subtle" style={{ marginTop: 6 }}>
              {data.error}
            </div>
          </div>
        ) : data && !('error' in data) ? (
          <div className="card card-pad">
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Stats</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ borderRadius: 14, padding: 12, background: '#0000FF', color: '#fff', fontWeight: 900 }}>
                <div style={{ fontSize: 12, opacity: 0.95 }}>All-time USDC</div>
                <div style={{ fontSize: 18 }}>${formatNumberString(data.allTime.total_usdc)}</div>
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
                ${formatNumberString(data.latestWeek.amount_usdc)}
              </span>
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
