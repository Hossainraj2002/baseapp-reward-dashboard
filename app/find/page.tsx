import FrameReady from '@/components/FrameReady';
import FindClient from '@/components/FindClient';

export default function FindPage() {
  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: 16, paddingBottom: 28, background: '#FFFFFF' }}>
      <FrameReady />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#0000FF' }}>Find</div>
      </div>

      <div style={{ marginTop: 12 }}>
        <FindClient />
      </div>
    </main>
  );
}
