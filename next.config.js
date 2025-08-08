/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  assetPrefix: process.env.BASE_PATH || '',
  basePath: process.env.BASE_PATH || '',
  trailingSlash: true,
  publicRuntimeConfig: {
    root: process.env.BASE_PATH || '',
  },
  optimizeFonts: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: 'frame-ancestors http://localhost:3000;' }
        ]
      }
    ];
  }
}

module.exports = nextConfig
