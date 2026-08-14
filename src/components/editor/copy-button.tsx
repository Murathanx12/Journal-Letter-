"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { toWhatsAppText } from "@/lib/text/whatsapp";
import type { RichTextDoc } from "@/lib/text/rich-text";

/**
 * Copy the letter, ready to send.
 *
 * These letters came from a WhatsApp thread and often go back to one, so what
 * lands on the clipboard is WhatsApp's own markup rather than either bare words
 * or HTML — paste it into a chat and the emphasis survives.
 *
 * `navigator.clipboard` needs a secure context and can be refused outright, so
 * there is a `document.execCommand` fallback behind it. Losing a letter to a
 * permission prompt would be a silly way to lose a letter.
 */
export function CopyButton({
  doc,
  title,
  className,
}: {
  doc: RichTextDoc;
  title?: string | null;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    const text = toWhatsAppText(doc, title);
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      if (copyTheOldWay(text)) setState("copied");
      else setState("failed");
    }
    setTimeout(() => setState("idle"), 2200);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={className}
      title="Copy this letter, ready to paste into WhatsApp"
    >
      {state === "copied" ? (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span aria-live="polite">
        {state === "copied" ? "Copied" : state === "failed" ? "Could not copy" : "Copy for WhatsApp"}
      </span>
    </button>
  );
}

/** Works where the async clipboard API is unavailable or denied. */
function copyTheOldWay(text: string): boolean {
  try {
    const field = document.createElement("textarea");
    field.value = text;
    // Off-screen rather than hidden: a `display: none` field cannot be selected.
    field.setAttribute("aria-hidden", "true");
    field.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(field);
    return ok;
  } catch {
    return false;
  }
}
