import FrameReady from '../../../components/FrameReady';
import ProfileView from '../../../components/ProfileView';
import { getAddress } from 'viem';
import Link from 'next/link';
import { buildProfilePayload } from '@/lib/profilePayload';

function safeChecksumAddress(input: string) {
  try {
    return getAddress(input);
  } catch {
    return null;
  }
}

function isAddressLike(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

export default async function FindAddressPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address: addrRaw } = await params;

  if (!isAddressLike(addrRaw)) {
    return (
      <main style={{ maxWidth: 420, margin: '0 auto', padding: 16 }}>
        <FrameReady />
        <div style={{ fontSize: 16, fontWeight: 900 }}>Invalid address</div>
        <div style={{ marginTop: 8, opacity: 0.75 }}>Address must be formatted like 0x...</div>
        <div style={{ marginTop: 12 }}>
          <Link href="/find">Back</Link>
        </div>
      </main>
    );
  }

  const address = safeChecksumAddress(addrRaw) ?? addrRaw;
  const payload = buildProfilePayload(address);

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: 16, paddingBottom: 28 }}>
      <FrameReady />
      <ProfileView data={payload} />
    </main>
  );
}
