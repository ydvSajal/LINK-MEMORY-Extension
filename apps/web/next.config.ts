import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@recall/types', '@recall/api-client'],
};

export default nextConfig;
