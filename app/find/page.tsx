import { ProfileView } from '@/components/profile-view';

export default function FindAddressPage({ params }: { params: { address: string } }) {
  return <ProfileView mode="address" address={params.address} viewerFid={null} />;
}
