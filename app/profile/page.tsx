import FrameReady from '@/components/FrameReady';
import AppShell from '@/components/AppShell';
import ProfileConnectedClient from '@/components/ProfileConnectedClient';

export default function ProfilePage() {
  return (
    <AppShell>
      <FrameReady />
      <ProfileConnectedClient />
    </AppShell>
  );
}
