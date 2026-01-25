import FrameReady from '@/components/FrameReady';
import ProfileDashboardClient from '@/components/ProfileDashboardClient';

export default function ProfilePage() {
  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: 16, paddingBottom: 28, background: '#FFFFFF' }}>
      <FrameReady />
      <ProfileDashboardClient />
    </main>
  );
}
