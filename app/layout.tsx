import type { Metadata, Viewport } from 'next'
import './globals.css'
import { PushManager } from '@/components/features/push/push-manager'

export const metadata: Metadata = {
  title: 'HomeOS',
  description: 'Your shared home',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'HomeOS',
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F2F7' },
    { media: '(prefers-color-scheme: dark)',  color: '#000000' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeScript />
        {children}
        <PushManager />
      </body>
    </html>
  )
}

// Runs before paint to restore theme + accent — prevents flash of wrong theme.
// theme can be 'light' | 'dark' | 'auto' (default: auto = follow system).
function ThemeScript() {
  const script = `
    (function() {
      var theme  = localStorage.getItem('theme');
      var accent = localStorage.getItem('accent');
      var html   = document.documentElement;
      if (theme === 'dark') {
        html.classList.add('dark');
      } else if (!theme || theme === 'auto') {
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) html.classList.add('dark');
      }
      // 'light': no class needed
      if (accent && accent !== 'blue') html.setAttribute('data-accent', accent);
    })();
  `
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
