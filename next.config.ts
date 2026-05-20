import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'image.tmdb.org' },
    ],
  },
  serverExternalPackages: ['better-sqlite3', 'tsdav', 'node-ical'],
}

export default nextConfig
