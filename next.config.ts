import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Genererer en standalone-build der kan køres som en selvstændig Node.js-process.
  // Kræves til deployment på en server (f.eks. bag en reverse proxy).
  output: "standalone",

  // Slår Turbopack root-advarslen fra ved at pege på projektmappen.
  // Fjern denne linje hvis du ikke ser advarslen på din server.
  experimental: {
    turbopack: {
      root: __dirname,
    },
  },
};

export default nextConfig;
