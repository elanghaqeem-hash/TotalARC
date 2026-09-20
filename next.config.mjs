import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

if (process.env.NODE_ENV === 'development') {
  initOpenNextCloudflareForDev();
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
