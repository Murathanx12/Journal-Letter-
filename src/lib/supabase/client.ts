"use client";

import { createBrowserClient } from "@supabase/ssr";

import { supabaseKey, supabaseUrl } from "./config";
import type { Database } from "./database.types";

/**
 * Browser client. Carries only the publishable key, which grants nothing on its
 * own — every table denies the `anon` role outright and the `authenticated`
 * policies are scoped to book membership.
 */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabaseKey());
}
