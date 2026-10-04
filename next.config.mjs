import path from 'node:path';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

if (process.env.NODE_ENV === 'development') {
  initOpenNextCloudflareForDev();
}

const isVercel = process.env.VERCEL === '1';
const isHostinger = process.env.TOTAL_ARC_HOSTINGER === '1';

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), browsing-topics=(), publickey-credentials-get=(self), publickey-credentials-create=(self), fullscreen=(self)',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  webpack(config, { isServer, nextRuntime }) {
    if (isVercel || isHostinger) {
      const useNodeHostingerShim =
        isHostinger && isServer && nextRuntime !== 'edge';

      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        '@opennextjs/cloudflare': path.resolve(
          process.cwd(),
          useNodeHostingerShim
            ? 'src/lib/cloudflare-node-shim.ts'
            : 'src/lib/cloudflare-vercel-shim.ts'
        ),
      };
    }
    return config;
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
