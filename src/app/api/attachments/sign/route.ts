import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth/session";
import { signMediaPaths } from "@/lib/media/storage";

/**
 * Re-sign media URLs.
 *
 * Signed URLs expire after an hour, which is shorter than some writing
 * sessions. The editor calls this to refresh them rather than making somebody
 * reload and lose their place.
 *
 * No membership check is needed here beyond being signed in: `signMediaPaths`
 * signs through the caller's own session, so the storage policies decide what
 * can be signed. A path belonging to somebody else's book simply comes back
 * missing.
 */

export const runtime = "nodejs";

const bodySchema = z.object({
  paths: z.array(z.string().min(1).max(500)).min(1).max(60),
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const signed = await signMediaPaths(parsed.data.paths);
  return NextResponse.json({ urls: Object.fromEntries(signed) });
}
