import type { NextConfig } from 'next'

const skipBuildChecks = process.env.SKIP_BUILD_CHECKS === '1'

const nextConfig: NextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: skipBuildChecks,
  },
  typescript: {
    ignoreBuildErrors: skipBuildChecks,
  },
  experimental: {
    cpus: 1,
    staticGenerationMaxConcurrency: 1,
    staticGenerationMinPagesPerWorker: 1,
    webpackMemoryOptimizations: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'image.tmdb.org' },
    ],
  },
  serverExternalPackages: [
    'better-sqlite3',
    'fast-xml-parser',
    'gaxios',
    'google-auth-library',
    'googleapis',
    'node-cron',
    'node-ical',
    'tsdav',
    'web-push',
  ],
}

export default nextConfig
