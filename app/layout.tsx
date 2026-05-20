import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hearth',
  description: 'Your shared home',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Hearth',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F2EE' },
    { media: '(prefers-color-scheme: dark)',  color: '#121009' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeScript />
        {children}
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
