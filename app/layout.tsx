import type { Metadata } from 'next';
import RootProvider from './rootProvider';
import FrameReady from '@/components/FrameReady';
import './globals.css';

// Keep your existing env name, but set it correctly in Vercel too
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

const MINIAPP_EMBED = JSON.stringify({
  version: '1',
  imageUrl: `${APP_URL}/preview.png`,
  button: {
    title: 'Open App',
    action: {
      type: 'launch_frame',
      name: 'Baseapp Reward Dashboard',
      url: APP_URL,
      splashImageUrl: `${APP_URL}/splash.png`,
      splashBackgroundColor: '#0000FF',
    },
  },
});

export const metadata: Metadata = {
  title: 'Baseapp Reward Dashboard',
  description: 'Weekly creator rewards dashboard for explore more details.',
  other: {
    'fc:miniapp': MINIAPP_EMBED,
    'fc:frame': MINIAPP_EMBED,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <RootProvider>
          <FrameReady />
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
