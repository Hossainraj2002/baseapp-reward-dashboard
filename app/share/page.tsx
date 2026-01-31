import type { Metadata } from 'next';

type SP = Record<string, string | undefined>;

export async function generateMetadata({
  searchParams,
}: {
  // Next.js 15.3.x typegen expects searchParams to be a Promise in checks
  searchParams: Promise<SP>;
}): Promise<Metadata> {
  const origin = 'https://baseapp-reward-dashboard.vercel.app';

  const sp = await searchParams;

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string' && v.length > 0) qs.set(k, v);
  }

  const ogImage = `${origin}/api/og?${qs.toString()}`;

  const title = 'Baseapp Reward Card';
  const description = 'Onchain reward stats card for sharing.';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}

export default function SharePage() {
  const appLink = 'https://base.app/app/baseapp-reward-dashboard.vercel.app';

  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>Share</div>

      <div style={{ opacity: 0.8, marginBottom: 14 }}>
        This page exists mainly so social platforms can read the OpenGraph image.
        Open the miniapp here:
      </div>

      <a href={appLink} style={{ fontWeight: 900, color: '#0000FF' }}>
        {appLink}
      </a>
    </main>
  );
}
