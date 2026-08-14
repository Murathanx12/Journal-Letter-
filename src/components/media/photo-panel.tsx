"use client";

import { FlipHorizontal2, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { Card } from "@/components/ui/surface";
import { MASKS, MASK_IDS, type MaskId } from "@/lib/media/masks";
import { DEFAULT_PLACEMENT, type PlacedMedia } from "@/lib/media/placement";
import { useMediaUpload } from "@/lib/media/use-upload";
import { cn } from "@/lib/utils/cn";

/** Adding photographs, and adjusting the one that is selected. */
export function PhotoPanel({
  bookId,
  entryId,
  items,
  selectedId,
  onSelect,
  onChange,
  onAddUrl,
}: {
  bookId: string;
  entryId: string | null;
  items: PlacedMedia[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (items: PlacedMedia[]) => void;
  /** Registers the signed URL for a freshly uploaded photograph. */
  onAddUrl: (path: string, url: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { upload, uploading, error } = useMediaUpload({ bookId, entryId });

  const selected = items.find((item) => item.id === selectedId) ?? null;

  function patch(changes: Partial<PlacedMedia>) {
    if (!selected) return;
    onChange(items.map((item) => (item.id === selected.id ? { ...item, ...changes } : item)));
  }

  async function addFiles(files: FileList) {
    try {
      const { placed, urls } = await upload(Array.from(files));
      for (const [path, url] of urls) onAddUrl(path, url);
      if (placed.length > 0) {
        onChange([...items, ...placed]);
        onSelect(placed.at(-1)!.id);
      }
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-base text-ink">Photographs</h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            Drag across the fold to move a photograph onto the next page. Everything stays
            private to this book.
          </p>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic"
          multiple
          className="sr-only"
          onChange={(event) => {
            if (event.target.files?.length) void addFiles(event.target.files);
          }}
        />

        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
          )}
          {uploading ? "Uploading…" : "Add photos"}
        </Button>
      </div>

      {error ? <FormError>{error}</FormError> : null}

      {items.length === 0 ? (
        <p className="text-xs text-ink-muted">
          No photographs on this page yet. Add one and it will appear on the page, where you can
          move it, cut it into a shape, and choose whether the writing sits over it or flows
          around it.
        </p>
      ) : null}

      {selected ? (
        <div className="space-y-4 border-t border-rule pt-4">
          <Field label="Which page" htmlFor="page" hint="Counting from the start of this entry.">
            <Input
              id="page"
              type="number"
              min={1}
              max={200}
              value={selected.page + 1}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) patch({ page: Math.max(0, Math.round(value) - 1) });
              }}
            />
          </Field>

          <Field label="Shape" htmlFor="mask">
            <div id="mask" className="flex flex-wrap gap-1.5">
              {MASK_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => patch({ mask: id as MaskId })}
                  aria-pressed={selected.mask === id}
                  title={MASKS[id].label}
                  className={cn(
                    "h-9 w-9 border-2 bg-ink/15 transition-transform",
                    selected.mask === id ? "scale-110 border-brand" : "border-transparent",
                  )}
                  style={{ clipPath: MASKS[id].clipPath }}
                >
                  <span className="sr-only">{MASKS[id].label}</span>
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="How it sits with the writing"
            htmlFor="mode"
            hint={
              selected.mode === "wrap"
                ? "The writing flows around the shape."
                : selected.layer === "behind"
                  ? "The writing sits on top of the photograph."
                  : "The photograph sits on top of the writing."
            }
          >
            <Select
              id="mode"
              value={selected.mode === "wrap" ? "wrap" : selected.layer}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "wrap") patch({ mode: "wrap" });
                else patch({ mode: "free", layer: value as "behind" | "front" });
              }}
            >
              <option value="behind">Behind the writing</option>
              <option value="front">In front of the writing</option>
              <option value="wrap">Text flows around it</option>
            </Select>
          </Field>

          {selected.mode === "wrap" ? (
            <Field label="Which side" htmlFor="side">
              <Select
                id="side"
                value={selected.side}
                onChange={(event) => patch({ side: event.target.value as "left" | "right" })}
              >
                <option value="right">On the right</option>
                <option value="left">On the left</option>
              </Select>
            </Field>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Size — ${Math.round(selected.width * 100)}%`} htmlFor="size">
              <input
                id="size"
                type="range"
                min={5}
                max={160}
                value={Math.round(selected.width * 100)}
                onChange={(event) => patch({ width: Number(event.target.value) / 100 })}
                className="w-full accent-[var(--color-brand)]"
              />
            </Field>

            <Field label={`Angle — ${selected.rotation}°`} htmlFor="rotation">
              <input
                id="rotation"
                type="range"
                min={-180}
                max={180}
                value={selected.rotation}
                onChange={(event) => patch({ rotation: Number(event.target.value) })}
                className="w-full accent-[var(--color-brand)]"
              />
            </Field>

            <Field label={`Fade — ${Math.round(selected.opacity * 100)}%`} htmlFor="opacity">
              <input
                id="opacity"
                type="range"
                min={5}
                max={100}
                value={Math.round(selected.opacity * 100)}
                onChange={(event) => patch({ opacity: Number(event.target.value) / 100 })}
                className="w-full accent-[var(--color-brand)]"
              />
            </Field>

            <Field
              label="Description"
              htmlFor="alt"
              hint="Read aloud by screen readers. Optional."
            >
              <Input
                id="alt"
                value={selected.alt}
                maxLength={300}
                onChange={(event) => patch({ alt: event.target.value })}
                placeholder="The ferry at dusk"
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => patch({ flipX: !selected.flipX })}
            >
              <FlipHorizontal2 className="h-4 w-4" aria-hidden="true" />
              Flip
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                patch({
                  rotation: 0,
                  x: DEFAULT_PLACEMENT.x,
                  y: DEFAULT_PLACEMENT.y,
                  width: DEFAULT_PLACEMENT.width,
                })
              }
            >
              Reset position
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(items.filter((item) => item.id !== selected.id));
                onSelect(null);
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Remove from page
            </Button>
          </div>
        </div>
      ) : items.length > 0 ? (
        <p className="border-t border-rule pt-4 text-xs text-ink-muted">
          Select a photograph on the page to change its shape, angle or position.
        </p>
      ) : null}
    </Card>
  );
}
