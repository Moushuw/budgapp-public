import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Les parcours e2e construisent dans .next-e2e pour ne partager aucun verrou avec `next dev` ni avec le build de `check`.
  distDir: process.env.BUDGAPP_DIST_DIR ?? ".next",
};

export default nextConfig;
