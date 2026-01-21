import type { Metadata, Viewport } from 'next';
import RootProvider from './rootProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Baseapp Reward Dashboard',
  description: 'Track your Base app USDC rewards',
};

export const viewport: Viewport = {
  width: '420',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
