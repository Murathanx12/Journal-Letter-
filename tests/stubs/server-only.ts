/**
 * Stub for the `server-only` package.
 *
 * The real module throws on import to stop server code being bundled into a
 * Client Component. Vitest is neither, so importing the real one would fail
 * every test of a server-side module. Aliased in `vitest.config.ts`.
 */
export {};
