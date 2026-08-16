/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  eslint: { ignoreDuringBuilds: false },
};

module.exports = nextConfig;
