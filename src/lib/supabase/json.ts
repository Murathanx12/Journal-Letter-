import type { Json } from "./database.types";

/**
 * The single cast where an application type meets a `jsonb` column.
 *
 * Our document and settings types describe the *shape* of the data (nodes,
 * marks, presets) and use `unknown` for open-ended attribute bags. Supabase's
 * `Json` describes the *encoding*. Both are true, but neither is structurally
 * assignable to the other, and widening our types to satisfy `Json` would mean
 * giving up the shape information everywhere else.
 *
 * So: one narrow, named, commented cast here — rather than `as any` scattered
 * across a dozen call sites. Everything passed through has come from
 * `JSON.parse`, a Zod-validated request body, or a literal we built ourselves,
 * so it is genuinely JSON-serialisable.
 */
export function asJson<T>(value: T): Json {
  return value as unknown as Json;
}
