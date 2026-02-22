/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@zerodev/webauthn-key': false,
    };
    return config;
  },
};

export default nextConfig;
