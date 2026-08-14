"use client";

import { Check, Loader2, SpellCheck2, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ParagraphCorrection, ProofreadMode } from "@/lib/proofread/types";
import { toWordSuggestions, type WordSuggestion } from "@/lib/proofread/suggestions";
import { toParagraphs } from "@/lib/text/apply-corrections";
import type { RichTextDoc } from "@/lib/text/rich-text";
import { cn } from "@/lib/utils/cn";

/**
 * Running a spelling check.
 *
 * Deliberately small. The result is not a list to work through — it is
 * underlines in the writing itself, which you click if you agree. Nothing is
 * applied for you, nothing is blocked, and anything applied is undone with
 * Ctrl/⌘+Z like any other edit.
 */
export function SpellingBar({
  bookId,
  doc,
  remaining,
  onSuggestions,
  onClear,
  className,
}: {
  bookId: string;
  doc: RichTextDoc;
  /** How many highlights are still showing, owned by the editor. */
  remaining: number;
  onSuggestions: (suggestions: WordSuggestion[]) => void;
  onClear: () => void;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<ProofreadMode>("gentle");
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  async function run(nextMode: ProofreadMode) {
    setLoading(true);
    setError(null);
    setMode(nextMode);

    try {
      const response = await fetch("/api/proofread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, mode: nextMode, paragraphs: toParagraphs(doc) }),
      });

      const result = (await response.json()) as
        | { corrections: ParagraphCorrection[] }
        | { error: string };

      if (!response.ok || "error" in result) {
        setError("error" in result ? result.error : "Could not check this entry.");
        return;
      }

      onSuggestions(toWordSuggestions(result.corrections));
      setChecked(true);
    } catch {
      setError("Could not reach the proofreader. Your writing is untouched.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={loading}
          onClick={() => void run("gentle")}
        >
          {loading && mode === "gentle" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <SpellCheck2 className="h-4 w-4" aria-hidden="true" />
          )}
          Check spelling
        </Button>

        {remaining > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onClear();
              setChecked(false);
            }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Hide highlights
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-ink-muted" aria-live="polite">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : remaining > 0 ? (
          <>
            {remaining} {remaining === 1 ? "word is" : "words are"} underlined. Click one to
            correct it — Ctrl/⌘+Z undoes it, like any other edit.
          </>
        ) : checked ? (
          <span className="inline-flex items-center gap-1.5 text-success">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Nothing left to look at.
          </span>
        ) : (
          <>
            Underlines what looks like a typo, using a dictionary on this site — no outside
            service, nothing to pay for. It only ever suggests a near-identical spelling of the
            same word, so other languages, pet names and made-up spellings are left alone. Nothing
            changes unless you click.
          </>
        )}
      </p>
    </div>
  );
}
