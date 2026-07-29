import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  experimental: {
    externalDir: true,
  },
  env: {
    REACT_APP_API_BASE: process.env.NEXT_PUBLIC_API_ORIGIN,
    REACT_APP_APP_ORIGIN: process.env.NEXT_PUBLIC_APP_ORIGIN,
    REACT_APP_MARKETING_ORIGIN: process.env.NEXT_PUBLIC_MARKETING_ORIGIN,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      react: path.resolve(process.cwd(), 'node_modules/react'),
      'react-dom': path.resolve(process.cwd(), 'node_modules/react-dom'),
      'lucide-react': path.resolve(process.cwd(), 'node_modules/lucide-react'),
    };
    return config;
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
