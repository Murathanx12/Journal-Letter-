import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

// Without this, Turbopack walks up looking for a lockfile and finds the one in
// the home directory, which would drag everything above the project into the
// build's file-tracing root.
const projectRoot = dirname(fileURLToPath(import.meta.url));

/**
 * Private journals must never be indexed and must never be cached by a shared
 * proxy. The `X-Robots-Tag` below is a belt-and-braces companion to the
 * per-route `robots` metadata in `src/app/(app)/layout.tsx`.
 */
const nextConfig: NextConfig = {
  turbopack: { root: projectRoot },
  outputFileTracingRoot: projectRoot,
  serverExternalPackages: ["@react-pdf/renderer"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
      {
        // Everything behind authentication is explicitly non-indexable.
        source: "/(library|books|invitations|settings)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
    ];
  },
};

export default nextConfig;
