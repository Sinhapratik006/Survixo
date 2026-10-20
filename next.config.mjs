/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: 'dist',
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': new URL('./src', import.meta.url).pathname,
    };
    return config;
  },
};

export default nextConfig;