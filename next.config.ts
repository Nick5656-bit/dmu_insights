import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build a standalone Node.js output for deployment targets like Vercel or a custom server.
  output: "standalone",

  // Keep Turbopack scoped to this project folder so Next.js does not walk up to parent directories.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
