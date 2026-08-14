"use client";

import { useSyncExternalStore } from "react";

/**
 * True once the client has hydrated, false during server rendering.
 *
 * Useful for values that only exist in a browser — the reader's timezone, a
 * draft in `localStorage` — where rendering them on the server would either be
 * wrong or cause a hydration mismatch.
 *
 * Implemented with `useSyncExternalStore` rather than the usual
 * `useState(false)` + `useEffect(() => setState(true))`, because that pattern
 * sets state inside an effect and triggers an extra render pass on every
 * component that uses it. Both snapshot functions return constants, so there is
 * nothing to allocate and nothing to subscribe to.
 */

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
