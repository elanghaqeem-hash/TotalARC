import path from 'node:path';
if (process.env.NODE_ENV === 'development') {
  const { initOpenNextCloudflareForDev } = await import('@opennextjs/cloudflare');
  initOpenNextCloudflareForDev();
}

const isVercel = process.env.VERCEL === '1';
const isNodeHosted = isVercel || process.env.TOTAL_ARC_NODE_RUNTIME === '1';

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
  {
    key: 'Content-Security-Policy',
    value: contentSecurityPolicy,
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), browsing-topics=(), publickey-credentials-get=(self), publickey-credentials-create=(self), fullscreen=(self)',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin',
  },
  {
    key: 'Cross-Origin-Resource-Policy',
    value: 'same-origin',
  },
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'off',
  },
  {
    key: 'X-Permitted-Cross-Domain-Policies',
    value: 'none',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Keep production builds within shared-hosting/cPanel resource limits.
    // Cloudflare/Vercel remain compatible; this only reduces build parallelism.
    cpus: 1,
    workerThreads: false,
    optimizePackageImports: ['lucide-react'],
  },
  webpack(config) {
    // TotalARC is Cloudflare-native, but the Vercel deployment is also kept as
    // an operational fallback. On Vercel only, redirect Workers runtime imports
    // to a small compatibility layer that exposes process.env plus a D1 HTTPS
    // adapter. Cloudflare/OpenNext builds continue using native bindings.
    if (isNodeHosted) {
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        '@opennextjs/cloudflare': path.resolve(
          process.cwd(),
          'src/lib/cloudflare-vercel-shim.ts'
        ),
      };
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
