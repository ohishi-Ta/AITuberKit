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
     const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: `frame-ancestors ${allowedOrigin};` },
          { key: 'Access-Control-Allow-Origin', value: allowedOrigin },
        ]
      }
    ];
  }
}

module.exports = nextConfig
