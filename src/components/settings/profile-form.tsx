"use client";

import { Download } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input, Select } from "@/components/ui/form";
import { Card } from "@/components/ui/surface";
import { exportMyData, updateProfile } from "@/lib/profile/actions";
import { ACCENTS, ACCENT_IDS, FONTS, FONT_IDS, getAccent, getFont, type AccentId, type FontId } from "@/lib/design/theme";
import { cn } from "@/lib/utils/cn";

export function ProfileForm({
  email,
  displayName: initialName,
  signature: initialSignature,
  preferredFont: initialFont,
  accent: initialAccent,
}: {
  email: string | null;
  displayName: string;
  signature: string | null;
  preferredFont: string;
  accent: string;
}) {
  const [pending, startTransition] = useTransition();
  const [downloading, startDownload] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState(initialName);
  const [signature, setSignature] = useState(initialSignature ?? "");
  const [preferredFont, setPreferredFont] = useState<FontId>(getFont(initialFont).id);
  const [accent, setAccent] = useState<AccentId>(getAccent(initialAccent).id);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateProfile({
        displayName,
        signature: signature.trim() ? signature.trim() : null,
        preferredFont,
        accent,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  function downloadData() {
    startDownload(async () => {
      const result = await exportMyData();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const blob = new Blob([result.data.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "journal-letter-export.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <Field label="Display name" htmlFor="displayName" hint="Shown above everything you write.">
          <Input
            id="displayName"
            value={displayName}
            maxLength={80}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </Field>

        <Field
          label="Signature"
          htmlFor="signature"
          hint="Optional. A short sign-off shown in a handwritten face beside your name."
        >
          <Input
            id="signature"
            value={signature}
            maxLength={80}
            placeholder="— always yours"
            onChange={(event) => setSignature(event.target.value)}
          />
        </Field>

        <Field
          label="Your typeface"
          htmlFor="preferredFont"
          hint={FONTS[preferredFont].description}
        >
          <Select
            id="preferredFont"
            value={preferredFont}
            onChange={(event) => setPreferredFont(event.target.value as FontId)}
          >
            {FONT_IDS.map((id) => (
              <option key={id} value={id}>
                {FONTS[id].label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Your accent" htmlFor="accent">
          <div id="accent" className="flex flex-wrap gap-2">
            {ACCENT_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setAccent(id)}
                aria-pressed={accent === id}
                title={ACCENTS[id].label}
                className={cn(
                  "h-8 w-8 rounded-full border-2 transition-transform",
                  accent === id ? "scale-110 border-ink" : "border-transparent",
                )}
                style={{ backgroundColor: `light-dark(${ACCENTS[id].light}, ${ACCENTS[id].dark})` }}
              >
                <span className="sr-only">{ACCENTS[id].label}</span>
              </button>
            ))}
          </div>
        </Field>

        <Card className="space-y-2">
          <p className="text-xs text-ink-muted">This is how your entries will be signed:</p>
          <div className="flex items-baseline gap-2.5">
            <span
              aria-hidden="true"
              className="inline-block h-px w-6 translate-y-[-0.25em]"
              style={{
                backgroundColor: `light-dark(${ACCENTS[accent].light}, ${ACCENTS[accent].dark})`,
              }}
            />
            <span
              className="text-sm tracking-wide"
              style={{
                color: `light-dark(${ACCENTS[accent].light}, ${ACCENTS[accent].dark})`,
                fontFamily: FONTS[preferredFont].stack,
              }}
            >
              {displayName || "Your name"}
            </span>
            {signature ? (
              <span className="font-[family-name:var(--font-caveat)] text-base text-ink-muted">
                {signature}
              </span>
            ) : null}
          </div>
        </Card>

        {error ? <FormError>{error}</FormError> : null}
        {saved ? <FormSuccess>Saved.</FormSuccess> : null}

        <Button onClick={save} disabled={pending || displayName.trim().length === 0}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </section>

      <section className="space-y-4 border-t border-rule pt-8">
        <h2 className="font-serif text-lg text-ink">Your data</h2>
        {email ? <p className="text-sm text-ink-muted">Signed in as {email}.</p> : null}

        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink">Export everything you have written</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              A JSON file containing your profile and every entry in every book you can read —
              including the original wording of anything that was corrected.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={downloadData} disabled={downloading}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {downloading ? "Preparing…" : "Download"}
          </Button>
        </Card>

        <Card className="space-y-1">
          <p className="text-sm font-medium text-ink">Deleting your account</p>
          <p className="text-xs text-ink-muted">
            Books you own are deleted individually from each book&rsquo;s settings. To close the
            account itself, email the address in the README — account deletion is intentionally not
            a one-click action in a product holding years of shared writing, because it would also
            remove your letters from books other people are still reading.
          </p>
        </Card>
      </section>
    </div>
  );
}
