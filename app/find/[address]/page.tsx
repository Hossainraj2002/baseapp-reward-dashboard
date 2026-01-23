import Link from 'next/link';
import { buildProfilePayload } from '@/lib/profilePayload';

export default function FindAddressPage({
  params,
}: {
  params: { address: string };
}) {
  const address = (params.address || '').trim();

  // Basic validation so we fail gracefully instead of crashing
  const isValid = /^0x[a-fA-F0-9]{40}$/.test(address);

  if (!isValid) {
    return (
      <main className="page">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <h1 style={{ margin: 0 }}>Find</h1>
          <Link href="/find" className="btn">
            Back
          </Link>
        </div>

        <div className="card card-pad" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 900, color: '#0A0A0A' }}>Invalid address</div>
          <div className="subtle" style={{ marginTop: 6 }}>
            Expected a wallet like <span style={{ fontWeight: 900 }}>0x...</span>
          </div>
        </div>
      </main>
    );
  }

  const payload = buildProfilePayload(address);

  return (
    <main className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <h1 style={{ margin: 0 }}>Find</h1>
        <Link href="/find" className="btn">
          Back
        </Link>
      </div>

      <div style={{ marginTop: 12 }}>
        {/* reuse the same UI as Profile page */}
        <pre className="card card-pad" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {JSON.stringify(payload, null, 2)}
        </pre>
      </div>
    </main>
  );
}
