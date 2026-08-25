import type { MetadataRoute } from 'next';

/**
 * Served at /manifest.webmanifest by the App Router's manifest convention.
 * `display: standalone` plus the maskable icons are what let the app install
 * to a phone home screen without browser chrome.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Konnect — Knowledge Intelligence',
    short_name: 'Konnect',
    description:
      "Ask your organisation's private knowledge base and get cited, grounded answers — by voice or text.",
    id: '/dashboard',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f1f0ec',
    theme_color: '#f1f0ec',
    categories: ['business', 'productivity', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Ask by voice',
        short_name: 'Voice',
        description: 'Open the microphone and ask a question out loud',
        url: '/dashboard?voice=1',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Conversations',
        short_name: 'Chats',
        description: 'Resume a previous conversation',
        url: '/dashboard/conversations',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
