import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/exports/results": [
      "./public/dmu-logo.png",
      "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff",
      "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff",
    ],
  },
  // Vercel's Next.js 16.3 adapter manages its own output. Combining it with
  // standalone fails while reading next-server.js.nft.json (next.js#96646).
  // Keep standalone output only for local/self-hosted builds.
  output: process.env.VERCEL === "1" ? undefined : "standalone",

  // Keep Turbopack scoped to this project folder so Next.js does not walk up to parent directories.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
