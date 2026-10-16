import type {Metadata, Viewport} from 'next';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '../src/styles.css';

export const metadata: Metadata = {
  title: 'Wirefen — Good things grow together',
  description: 'Wirefen connects growers and buyers. Discover produce, record your growing history, and request supply.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Wirefen',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon-192.png',
  },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#234c36',
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
