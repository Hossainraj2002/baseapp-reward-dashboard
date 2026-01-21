import FrameReady from '@/components/FrameReady';
import ProfileConnectedClient from '@/components/ProfileConnectedClient';

// Server wrapper so we can render the client profile UI that reads MiniKit context.
export default function ProfilePage() {
  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: 16, paddingBottom: 28, background: '#FFFFFF' }}>
      <FrameReady />
      <ProfileConnectedClient />
    </main>
  );
}
