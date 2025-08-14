/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['blob.v0.dev'],
    formats: ['image/webp', 'image/avif'],
    unoptimized: true,
  },
  
  // Enable static optimization
  trailingSlash: false,
  
  // Optimize bundle
  experimental: {
    optimizeCss: true,
  },
  
  // PWA and asset handling
  async headers() {
    return [
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/manifest+json',
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
    ]
  },
  
  // ESLint and TypeScript configurations
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
