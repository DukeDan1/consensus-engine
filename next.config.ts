import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
    ],
  },
  experimental: {
    proxyClientMaxBodySize: '30mb',
    serverActions: {
      bodySizeLimit: '30mb',
    }
  },
};

export default nextConfig;
