import React from 'react';
import BottomNav from './BottomNav';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={pageBg}>
      <div style={pageWrap}>
        {children}
        {/* Space so content never hides behind the nav */}
        <div style={{ height: 92 }} />
      </div>

      <BottomNav />
    </div>
  );
}

const pageBg: React.CSSProperties = {
  minHeight: '100vh',
  background:
    'radial-gradient(900px 500px at 15% -10%, rgba(165,210,255,0.35), transparent 55%), radial-gradient(900px 500px at 85% 0%, rgba(0,0,255,0.10), transparent 60%), #ffffff',
};

const pageWrap: React.CSSProperties = {
  maxWidth: 420,
  margin: '0 auto',
};
