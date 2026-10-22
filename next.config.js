/** @type {import('next').NextConfig} */
const nextConfig = {
  // Local E2E runs build into their own folder so they never share a dev server or cache with `npm run dev`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // appDir এখন ডিফল্ট সাপোর্টেড, তাই সরিয়ে ফেলুন
  // The service worker must be re-checked on every load so updates reach installed apps quickly.
  async headers() {
    return [{ source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] }]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
}

module.exports = nextConfig

