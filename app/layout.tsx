import type { Metadata } from 'next';
import RootProvider from './rootProvider';
import FrameReady from '@/components/FrameReady';
import './globals.css';

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
  // Keep FC metadata here. Base app_id will be hardcoded in <head> below.
  other: {
    'fc:miniapp': MINIAPP_EMBED,
    'fc:frame': MINIAPP_EMBED,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Base App verification: include BOTH variants for maximum compatibility */}
        <meta name="base:app_id" content="6970f9825f24b57cc50d3331" />
        <meta property="base:app_id" content="6970f9825f24b57cc50d3331" />
      </head>

      <body>
        {/* Must be first; must NOT depend on any provider */}
        <FrameReady />
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
