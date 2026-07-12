/** @type {import('next').NextConfig} */
const nextConfig = {
  // appDir এখন ডিফল্ট সাপোর্টেড, তাই সরিয়ে ফেলুন
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

