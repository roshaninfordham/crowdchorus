import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Off on purpose: every room page and API route is request-time data.
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
