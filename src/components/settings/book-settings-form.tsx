"use client";

import { useState, useTransition } from "react";

import { BookCover } from "@/components/book/book-cover";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, FormSuccess, Input, Select, Textarea } from "@/components/ui/form";
import { Card } from "@/components/ui/surface";
import { updateBook } from "@/lib/books/actions";
import { COMMON_TIMEZONES } from "@/lib/date/calendar-date";
import {
  COVER_PRESETS,
  COVER_PRESET_IDS,
  FONTS,
  FONT_IDS,
  PRESETS,
  PRESET_IDS,
  type BookCover as BookCoverValue,
  type BookDesign,
  type CoverPresetId,
  type FontId,
  type PresetId,
} from "@/lib/design/theme";
import { cn } from "@/lib/utils/cn";

export function BookSettingsForm({
  bookId,
  title: initialTitle,
  subtitle: initialSubtitle,
  description: initialDescription,
  timezone: initialTimezone,
  cover,
  design,
}: {
  bookId: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  timezone: string;
  cover: BookCoverValue;
  design: BookDesign;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initialTitle);
  const [subtitle, setSubtitle] = useState(initialSubtitle ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [timezone, setTimezone] = useState(initialTimezone);
  const [coverPreset, setCoverPreset] = useState<CoverPresetId>(cover.preset);
  const [designPreset, setDesignPreset] = useState<PresetId>(design.preset);
  const [bodyFont, setBodyFont] = useState<FontId | "">(design.bodyFont ?? "");
  const [headingFont, setHeadingFont] = useState<FontId | "">(design.headingFont ?? "");
  const [baseSize, setBaseSize] = useState(design.baseSize ?? PRESETS[design.preset].baseSize);
  const [lineHeight, setLineHeight] = useState(
    design.lineHeight ?? PRESETS[design.preset].lineHeight,
  );
  const [perAuthorFonts, setPerAuthorFonts] = useState(design.perAuthorFonts);
  const [showSignatures, setShowSignatures] = useState(design.showSignatures);
  const [pageSize, setPageSize] = useState(design.pageSize);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateBook({
        bookId,
        title,
        subtitle: subtitle.trim() ? subtitle.trim() : null,
        description: description.trim() ? description.trim() : null,
        timezone,
        coverPreset,
        designPreset,
        bodyFont: bodyFont || null,
        headingFont: headingFont || null,
        baseSize,
        lineHeight,
        perAuthorFonts,
        showSignatures,
        pageSize,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <h2 className="font-serif text-lg text-ink">The book</h2>

        <Field label="Title" htmlFor="title">
          <Input id="title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        <Field label="Subtitle" htmlFor="subtitle">
          <Input
            id="subtitle"
            value={subtitle}
            maxLength={160}
            onChange={(e) => setSubtitle(e.target.value)}
          />
        </Field>

        <Field label="Description" htmlFor="description" hint="Only you and the other members see this.">
          <Textarea
            id="description"
            rows={3}
            value={description}
            maxLength={600}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <Field
          label="Timezone"
          htmlFor="timezone"
          hint="Decides which calendar day an entry belongs to. Changing it does not move existing entries."
        >
          <Select id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {!COMMON_TIMEZONES.includes(timezone as (typeof COMMON_TIMEZONES)[number]) ? (
              <option value={timezone}>{timezone}</option>
            ) : null}
            {COMMON_TIMEZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>
      </section>

      <section className="space-y-5">
        <h2 className="font-serif text-lg text-ink">How it looks</h2>

        <div className="grid gap-6 sm:grid-cols-[1fr_9rem]">
          <div className="space-y-5">
            <Field label="Cover" htmlFor="cover">
              <div id="cover" className="flex flex-wrap gap-2">
                {COVER_PRESET_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setCoverPreset(id)}
                    aria-pressed={coverPreset === id}
                    title={COVER_PRESETS[id].label}
                    className={cn(
                      "h-9 w-9 rounded-full border-2 transition-transform",
                      coverPreset === id ? "scale-110 border-ink" : "border-rule",
                    )}
                    style={{ background: COVER_PRESETS[id].background }}
                  >
                    <span className="sr-only">{COVER_PRESETS[id].label}</span>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Typography preset" htmlFor="designPreset" hint={PRESETS[designPreset].description}>
              <Select
                id="designPreset"
                value={designPreset}
                onChange={(e) => {
                  const next = e.target.value as PresetId;
                  setDesignPreset(next);
                  // Following the preset is the expected behaviour when you pick
                  // one; overrides can be re-applied afterwards.
                  setBaseSize(PRESETS[next].baseSize);
                  setLineHeight(PRESETS[next].lineHeight);
                  setBodyFont("");
                  setHeadingFont("");
                }}
              >
                {PRESET_IDS.map((id) => (
                  <option key={id} value={id}>
                    {PRESETS[id].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="order-first sm:order-last">
            <BookCover
              title={title || "Untitled"}
              subtitle={subtitle}
              cover={{ preset: coverPreset, imagePath: cover.imagePath }}
              designPreset={designPreset}
              size="sm"
              className="shadow-sm"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Body typeface" htmlFor="bodyFont">
            <Select
              id="bodyFont"
              value={bodyFont}
              onChange={(e) => setBodyFont(e.target.value as FontId | "")}
            >
              <option value="">Follow the preset ({FONTS[PRESETS[designPreset].bodyFont].label})</option>
              {FONT_IDS.map((id) => (
                <option key={id} value={id}>
                  {FONTS[id].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Heading typeface" htmlFor="headingFont">
            <Select
              id="headingFont"
              value={headingFont}
              onChange={(e) => setHeadingFont(e.target.value as FontId | "")}
            >
              <option value="">
                Follow the preset ({FONTS[PRESETS[designPreset].headingFont].label})
              </option>
              {FONT_IDS.map((id) => (
                <option key={id} value={id}>
                  {FONTS[id].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={`Text size — ${baseSize}px`} htmlFor="baseSize">
            <input
              id="baseSize"
              type="range"
              min={13}
              max={26}
              value={baseSize}
              onChange={(e) => setBaseSize(Number(e.target.value))}
              className="w-full accent-[var(--color-brand)]"
            />
          </Field>

          <Field label={`Line spacing — ${lineHeight.toFixed(2)}`} htmlFor="lineHeight">
            <input
              id="lineHeight"
              type="range"
              min={1.3}
              max={2.4}
              step={0.05}
              value={lineHeight}
              onChange={(e) => setLineHeight(Number(e.target.value))}
              className="w-full accent-[var(--color-brand)]"
            />
          </Field>

          <Field label="Page size for export" htmlFor="pageSize">
            <Select
              id="pageSize"
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as BookDesign["pageSize"])}
            >
              <option value="A5">A5 — book sized</option>
              <option value="DIGEST">Digest — 5.5 × 8.5 in</option>
              <option value="A4">A4</option>
              <option value="LETTER">US Letter</option>
            </Select>
          </Field>
        </div>

        <Card className="space-y-3">
          <Checkbox
            id="perAuthorFonts"
            label="Show each writer's own typeface"
            checked={perAuthorFonts}
            onChange={(e) => setPerAuthorFonts(e.target.checked)}
          />
          <Checkbox
            id="showSignatures"
            label="Show signatures next to names"
            checked={showSignatures}
            onChange={(e) => setShowSignatures(e.target.checked)}
          />
          <p className="text-xs text-ink-muted">
            Names and dates are always shown, whatever these are set to — nobody should have to
            guess who wrote something.
          </p>
        </Card>
      </section>

      {error ? <FormError>{error}</FormError> : null}
      {saved ? <FormSuccess>Saved.</FormSuccess> : null}

      <div className="border-t border-rule pt-5">
        <Button onClick={save} disabled={pending || title.trim().length === 0}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
