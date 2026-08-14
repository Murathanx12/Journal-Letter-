import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Vite resolves the `@/*` aliases from tsconfig.json natively.
    tsconfigPaths: true,
    alias: {
      // `server-only` deliberately throws when imported outside a Server
      // Component. That guard is right in the app and useless in a test runner,
      // so it is stubbed out here.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    // These are pure-logic tests: no database, no network, no browser. They run
    // anywhere, including CI with no credentials configured.
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
  },
});
