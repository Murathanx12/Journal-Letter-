import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Next 16 renamed the `middleware.ts` convention to `proxy.ts`. Same runtime,
 * same matcher semantics.
 *
 * Two jobs here, in this order:
 *   1. Refresh the Supabase session cookie so server components downstream see
 *      a live session instead of randomly logging people out.
 *   2. Bounce anonymous visitors away from private routes.
 *
 * This is a convenience gate, not the security boundary. The real boundary is
 * Row Level Security in Postgres — if this file were deleted entirely, an
 * unauthenticated request would still read nothing.
 */

const PUBLIC_PATHS = ["/", "/login", "/signup", "/forgot-password", "/reset-password"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Auth callbacks and password recovery links must stay reachable.
  return pathname.startsWith("/auth/");
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Nothing must run between creating the client and this call.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  // API routes enforce their own authentication and answer in JSON. Redirecting
  // them to /login would hand an API caller an HTML page with a 200, which is
  // both useless to parse and a poor security signal — a rejected request
  // should say 401.
  if (pathname.startsWith("/api/")) {
    return response;
  }

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Remember where they were headed — invitation links depend on this.
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // A signed-in person has no use for the login/signup screens.
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/library";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Keeping the matcher wide
     * means the session cookie is refreshed on essentially every navigation.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
