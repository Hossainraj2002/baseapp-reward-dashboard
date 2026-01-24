import FrameReady from '@/components/FrameReady';
import ProfileView from '@/components/ProfileView';
import { buildProfilePayload } from '@/lib/profilePayload';

type PageProps = {
  params: { address: string };
};

function isEvmAddress(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

export default async function FindAddressPage({ params }: PageProps) {
  const address = params.address;

  // Always render readiness call first
  if (!isEvmAddress(address)) {
    return (
      <main style={{ maxWidth: 420, margin: '0 auto', padding: 16, paddingBottom: 28, background: '#FFFFFF' }}>
        <FrameReady />
        <div className="card card-pad" style={{ border: '2px solid #0000FF' }}>
          <div style={{ fontWeight: 900 }}>Invalid address</div>
          <div className="subtle" style={{ marginTop: 6 }}>
            Expected a valid EVM address like <span style={{ fontWeight: 900 }}>0x...</span>
          </div>
        </div>
      </main>
    );
  }

  const data = buildProfilePayload(address);

  // ✅ Prevent unhandled error
  if ('error' in data) {
    return (
      <main style={{ maxWidth: 420, margin: '0 auto', padding: 16, paddingBottom: 28, background: '#FFFFFF' }}>
        <FrameReady />
        <div className="card card-pad" style={{ border: '2px solid #0000FF' }}>
          <div style={{ fontWeight: 900 }}>Could not load this address</div>
          <div className="subtle" style={{ marginTop: 6 }}>{String(data.error)}</div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: 16, paddingBottom: 28, background: '#FFFFFF' }}>
      <FrameReady />
      <ProfileView data={data} />
    </main>
  );
}
