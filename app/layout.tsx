import type { Metadata } from 'next';
import RootProvider from './rootProvider';
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
  other: {
    // Farcaster Mini App embed metadata
    'fc:miniapp': MINIAPP_EMBED,
    // Backward compatibility for some clients
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
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
