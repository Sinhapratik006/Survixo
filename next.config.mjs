/**
 * The web app talks to the API through same-origin paths (`/api/*`, `/v1/*`),
 * so the API host is never hardcoded in the frontend code.
 *
 * - Dev (`next dev`): no static export, so these rewrites actually run and
 *   proxy to the local API server (API_ORIGIN, default http://localhost:8787).
 * - Production on Vercel: NEXT_OUTPUT_EXPORT=true produces a static export
 *   (rewrites are ignored by `output: export`), and the same paths are
 *   proxied by the `rewrites` block in vercel.json instead.
 */
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:8787';

const nextConfig = {
  ...(process.env.NEXT_OUTPUT_EXPORT === 'true' ? { output: 'export' } : {}),
  outputFileTracingRoot: process.cwd(),
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
      {
        source: '/v1/:path*',
        destination: `${apiOrigin}/v1/:path*`,
      },
    ];
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': new URL('./src', import.meta.url).pathname,
    };
    return config;
  },
};

export default nextConfig;
