import { NextResponse, type NextRequest } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { isCalendarDate, type CalendarDate } from "@/lib/date/calendar-date";
import { compileBookForExport, exportFilename } from "@/lib/export/compile";
import { renderBookDocx } from "@/lib/export/docx";
import { renderBookPdf } from "@/lib/export/pdf";
import { createClient } from "@/lib/supabase/server";

/**
 * File exports.
 *
 * A GET so the button can be an ordinary download link. Every parameter is
 * re-validated here rather than trusted from the query string, and membership
 * is checked before a single row is read — although RLS would withhold the
 * entries regardless, a 404 is a better answer than an empty book.
 */

// @react-pdf/renderer needs Node APIs; it cannot run on the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A decade of letters takes a while to typeset.
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ format: string }> },
) {
  const { format } = await context.params;
  if (format !== "pdf" && format !== "docx") {
    return NextResponse.json({ error: "Unknown format." }, { status: 404 });
  }

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const bookId = params.get("bookId");
  if (!bookId) return NextResponse.json({ error: "Missing book." }, { status: 400 });

  const supabase = await createClient();
  const { data: isMember } = await supabase.rpc("is_book_member", { p_book_id: bookId });
  if (!isMember) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const textVersion = params.get("textVersion") === "original" ? "original" : "current";
  const fromRaw = params.get("from");
  const toRaw = params.get("to");
  const from = fromRaw && isCalendarDate(fromRaw) ? (fromRaw as CalendarDate) : undefined;
  const to = toRaw && isCalendarDate(toRaw) ? (toRaw as CalendarDate) : undefined;
  const includeCover = params.get("includeCover") !== "0";

  const doc = await compileBookForExport(bookId, { textVersion, from, to, includeCover });

  if (doc.days.length === 0) {
    return NextResponse.json(
      { error: "There is nothing to export in that range." },
      { status: 422 },
    );
  }

  try {
    const bytes =
      format === "pdf" ? await renderBookPdf(doc) : await renderBookDocx(doc);

    const filename = exportFilename(doc.title, format);
    const contentType =
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    return new NextResponse(bytes as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(bytes.byteLength),
        // Private writing must never be held by a shared cache.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error(`Export failed (${format})`, error);
    return NextResponse.json({ error: "Could not build the file." }, { status: 500 });
  }
}
