"use client";

import { Check, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { FormError } from "@/components/ui/form";
import type { ParagraphCorrection, ProofreadMode } from "@/lib/proofread/types";
import { applyParagraphCorrections, toParagraphs } from "@/lib/text/apply-corrections";
import { diffWords } from "@/lib/text/diff";
import type { RichTextDoc } from "@/lib/text/rich-text";
import { cn } from "@/lib/utils/cn";

/**
 * The proofreading review surface.
 *
 * Nothing here changes the entry until somebody presses Accept. Each paragraph
 * is reviewed on its own, so a writer can take the spelling fix and refuse the
 * one that would have flattened how they say goodbye.
 */
export function ProofreadPanel({
  bookId,
  doc,
  onApply,
  className,
}: {
  bookId: string;
  doc: RichTextDoc;
  /** Receives the corrected document once the writer accepts. */
  onApply: (corrected: RichTextDoc, mode: ProofreadMode) => Promise<void> | void;
  className?: string;
}) {
  const [mode, setMode] = useState<ProofreadMode>("gentle");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<ParagraphCorrection[] | null>(null);
  const [rejected, setRejected] = useState<Set<number>>(new Set());

  async function run(nextMode: ProofreadMode) {
    setLoading(true);
    setError(null);
    setCorrections(null);
    setRejected(new Set());
    setMode(nextMode);

    try {
      const response = await fetch("/api/proofread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, mode: nextMode, paragraphs: toParagraphs(doc) }),
      });

      const result = (await response.json()) as
        | { corrections: ParagraphCorrection[]; unchanged: boolean }
        | { error: string };

      if (!response.ok || "error" in result) {
        setError("error" in result ? result.error : "Could not check this entry.");
        return;
      }

      setCorrections(result.corrections);
    } catch {
      setError("Could not reach the proofreader. Your writing is untouched.");
    } finally {
      setLoading(false);
    }
  }

  const accepted = (corrections ?? []).filter((correction) => !rejected.has(correction.index));

  async function acceptAll() {
    if (accepted.length === 0) return;
    setApplying(true);
    setError(null);
    try {
      await onApply(applyParagraphCorrections(doc, accepted), mode);
      setCorrections(null);
    } catch {
      setError("Could not save the corrections.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <Card className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-base text-ink">Proofreading</h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            Your original is always kept and can be restored at any time.
          </p>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={loading} onClick={() => void run("gentle")}>
            {loading && mode === "gentle" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            Spelling only
          </Button>
          <Button size="sm" variant="ghost" disabled={loading} onClick={() => void run("polish")}>
            {loading && mode === "polish" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            Polish
          </Button>
        </div>
      </div>

      <p className="text-xs text-ink-muted">
        {mode === "gentle"
          ? "Only misspellings, capitals and punctuation. A word can only be swapped for a near-identical spelling of itself, so words in another language, pet names and made-up spellings are left exactly as you wrote them. Anything it is not sure about, it leaves alone."
          : "Polish is a firmer edit that may reword awkward sentences. Use it deliberately — it can change how something sounds. Your original is still kept."}
      </p>

      {error ? <FormError>{error}</FormError> : null}

      {corrections !== null && corrections.length === 0 ? (
        <p className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
          Nothing to fix — it reads well as it is.
        </p>
      ) : null}

      {corrections && corrections.length > 0 ? (
        <>
          <ul className="space-y-3">
            {corrections.map((correction) => {
              const isRejected = rejected.has(correction.index);
              return (
                <li
                  key={correction.index}
                  className={cn(
                    "rounded-lg border p-3 transition-opacity",
                    isRejected ? "border-rule opacity-50" : "border-rule-strong",
                  )}
                >
                  <p className="font-serif text-sm leading-relaxed">
                    {diffWords(correction.original, correction.corrected).map((op, index) => {
                      if (op.type === "same") return <span key={index}>{op.value}</span>;
                      if (op.type === "removed") {
                        return (
                          <del
                            key={index}
                            className="bg-danger/10 text-danger decoration-danger/60"
                          >
                            {op.value}
                          </del>
                        );
                      }
                      return (
                        <ins key={index} className="bg-success/10 text-success no-underline">
                          {op.value}
                        </ins>
                      );
                    })}
                  </p>

                  {correction.notes.length > 0 ? (
                    <p className="mt-2 text-xs text-ink-muted">{correction.notes.join(" · ")}</p>
                  ) : null}

                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setRejected((current) => {
                          const next = new Set(current);
                          if (isRejected) next.delete(correction.index);
                          else next.add(correction.index);
                          return next;
                        })
                      }
                      className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
                    >
                      {isRejected ? (
                        <>
                          <RotateCcw className="h-3 w-3" aria-hidden="true" />
                          Include again
                        </>
                      ) : (
                        <>
                          <X className="h-3 w-3" aria-hidden="true" />
                          Keep mine
                        </>
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between gap-3 border-t border-rule pt-3">
            <p className="text-xs text-ink-muted">
              {accepted.length} of {corrections.length} will be applied.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setCorrections(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void acceptAll()} disabled={applying || accepted.length === 0}>
                {applying ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )}
                Accept {accepted.length === corrections.length ? "all" : "selected"}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </Card>
  );
}
