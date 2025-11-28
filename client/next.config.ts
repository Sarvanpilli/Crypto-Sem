import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // @ts-expect-error - allowedDevOrigins is missing from NextConfig type but required for suppressing the warning
    allowedDevOrigins: ["10.113.21.30", "localhost:3000"],
  },
};

export default nextConfig;
