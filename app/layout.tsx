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

// Runs before paint to set the theme class — prevents flash of wrong theme
// Defaults to light; only goes dark if user has explicitly chosen it
function ThemeScript() {
  const script = `
    (function() {
      var stored = localStorage.getItem('theme');
      if (stored === 'dark') document.documentElement.classList.add('dark');
    })();
  `
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
