"use client";

import { FileDown, FileText, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button, buttonClasses } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select } from "@/components/ui/form";
import { Card } from "@/components/ui/surface";
import type { CalendarDate } from "@/lib/date/calendar-date";

type RangeMode = "all" | "year" | "custom";

/**
 * Choosing what to export.
 *
 * The one decision that genuinely matters is "original" versus "current". A
 * printed book is permanent, so this is spelled out in full rather than hidden
 * behind a word like "clean".
 */
export function ExportPanel({
  bookId,
  firstEntryDate,
  lastEntryDate,
  entryCount,
  wordCount,
  googleDocsAvailable,
}: {
  bookId: string;
  firstEntryDate: CalendarDate | null;
  lastEntryDate: CalendarDate | null;
  entryCount: number;
  wordCount: number;
  googleDocsAvailable: boolean;
}) {
  const [textVersion, setTextVersion] = useState<"current" | "original">("current");
  const [rangeMode, setRangeMode] = useState<RangeMode>("all");
  const [from, setFrom] = useState(firstEntryDate ?? "");
  const [to, setTo] = useState(lastEntryDate ?? "");
  const [includeCover, setIncludeCover] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const thisYear = String(new Date().getFullYear());

  function buildParams(): URLSearchParams {
    const params = new URLSearchParams({ bookId, textVersion });
    if (!includeCover) params.set("includeCover", "0");

    if (rangeMode === "year") {
      params.set("from", `${thisYear}-01-01`);
      params.set("to", `${thisYear}-12-31`);
    } else if (rangeMode === "custom") {
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    }

    return params;
  }

  /**
   * Fetch rather than navigate, so a server-side failure surfaces as a message
   * instead of replacing the page with raw JSON.
   */
  async function download(format: "pdf" | "docx") {
    setBusy(format);
    setError(null);

    try {
      const response = await fetch(`/api/export/${format}?${buildParams().toString()}`);

      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(problem?.error ?? "Could not build the file.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? `book.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not build the file.");
    } finally {
      setBusy(null);
    }
  }

  const nothingToExport = entryCount === 0;

  return (
    <Card className="space-y-5 self-start">
      <div>
        <h2 className="font-serif text-lg text-ink">Export this book</h2>
        <p className="mt-1 text-xs text-ink-muted">
          {entryCount.toLocaleString()} entries · {wordCount.toLocaleString()} words
        </p>
      </div>

      <Field
        label="Which words to print"
        htmlFor="textVersion"
        hint={
          textVersion === "original"
            ? "Exactly as each person wrote it, with no machine corrections at all."
            : "The book as it reads now, including corrections that were accepted."
        }
      >
        <Select
          id="textVersion"
          value={textVersion}
          onChange={(event) => setTextVersion(event.target.value as "current" | "original")}
        >
          <option value="current">Current text</option>
          <option value="original">Original writing</option>
        </Select>
      </Field>

      <Field label="How much" htmlFor="range">
        <Select
          id="range"
          value={rangeMode}
          onChange={(event) => setRangeMode(event.target.value as RangeMode)}
        >
          <option value="all">The entire book</option>
          <option value="year">This year ({thisYear})</option>
          <option value="custom">A date range</option>
        </Select>
      </Field>

      {rangeMode === "custom" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" htmlFor="from">
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To" htmlFor="to">
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      ) : null}

      <Checkbox
        id="includeCover"
        label="Include a title page"
        checked={includeCover}
        onChange={(event) => setIncludeCover(event.target.checked)}
      />

      {error ? <FormError>{error}</FormError> : null}

      <div className="space-y-2 border-t border-rule pt-4">
        <Button
          className="w-full"
          disabled={busy !== null || nothingToExport}
          onClick={() => void download("pdf")}
        >
          {busy === "pdf" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileDown className="h-4 w-4" aria-hidden="true" />
          )}
          {busy === "pdf" ? "Typesetting…" : "Download PDF"}
        </Button>

        <Button
          variant="secondary"
          className="w-full"
          disabled={busy !== null || nothingToExport}
          onClick={() => void download("docx")}
        >
          {busy === "docx" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileText className="h-4 w-4" aria-hidden="true" />
          )}
          {busy === "docx" ? "Building…" : "Download Word (.docx)"}
        </Button>

        {googleDocsAvailable ? (
          // A real link, not a router push: this route hands off to Google's
          // consent screen on another origin, which the client router cannot do.
          <a
            href={nothingToExport ? undefined : `/api/google/authorize?${buildParams().toString()}`}
            aria-disabled={nothingToExport}
            className={buttonClasses(
              "secondary",
              "md",
              `w-full ${nothingToExport ? "pointer-events-none opacity-50" : ""}`,
            )}
          >
            Create a Google Doc
          </a>
        ) : (
          <p className="rounded-lg border border-rule bg-surface-sunk/60 px-3 py-2 text-xs text-ink-muted">
            Google Docs export needs `GOOGLE_DOCS_CLIENT_ID` and
            `GOOGLE_DOCS_CLIENT_SECRET` to be set. Until then, the .docx above imports into Google
            Docs cleanly.
          </p>
        )}
      </div>

      <p className="text-xs text-ink-muted">
        The .docx opens in Word, Pages and Google Docs. The PDF is typeset for printing, with a
        title page, dates as chapter headings and page numbers.
      </p>
    </Card>
  );
}
