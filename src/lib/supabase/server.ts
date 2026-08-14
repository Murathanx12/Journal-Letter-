import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseKey, supabaseUrl } from "./config";
import type { Database } from "./database.types";

/**
 * Request-scoped server client.
 *
 * Deliberately created per request rather than memoised into a module-level
 * variable: on Fluid compute a shared client would leak one user's session into
 * another user's request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. Safe to ignore: `proxy.ts`
          // refreshes the session on every request before we get here.
        }
      },
    },
  });
}
