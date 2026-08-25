import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider } from '@/lib/theme';
import ServiceWorkerRegistrar from '@/components/pwa/ServiceWorkerRegistrar';
import InstallBanner from '@/components/pwa/InstallPrompt';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Konnect — Knowledge Intelligence',
    template: '%s · Konnect',
  },
  description:
    "Ask your organisation's private knowledge base and get cited, grounded answers — by voice or text.",
  applicationName: 'Konnect',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Konnect',
    // Content runs under the status bar so the cream canvas reaches the top.
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icons/icon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
    other: [{ rel: 'mask-icon', url: '/icons/mask-icon.svg', color: '#141419' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets the dock and sheets extend into the home-indicator area, which the
  // safe-area tokens then pad back out.
  viewportFit: 'cover',
  themeColor: '#f1f0ec',
};

/**
 * Applies the stored theme before first paint. Without this the app renders
 * one light frame for dark-mode users. Mirrors lib/theme.tsx.
 */
const THEME_SCRIPT = `
(function(){try{
  var t = localStorage.getItem('konnect-theme') || 'system';
  if (t !== 'system') document.documentElement.setAttribute('data-theme', t);
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}catch(e){}})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <AuthProvider>
            {children}
            <ServiceWorkerRegistrar />
            <InstallBanner />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
