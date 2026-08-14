"use client";

import { FlipHorizontal2, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { Card } from "@/components/ui/surface";
import { MASKS, MASK_IDS, type MaskId } from "@/lib/media/masks";
import { DEFAULT_PLACEMENT, type PlacedMedia } from "@/lib/media/placement";
import { cn } from "@/lib/utils/cn";

/**
 * Adding photographs, and adjusting the one that is selected.
 *
 * Image dimensions are read in the browser before upload and sent along, so the
 * server never has to decode the file to learn its aspect ratio — and a picture
 * is never rendered squashed while it waits for that to be worked out.
 */

async function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("decode failed"));
      image.src = url;
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
  } catch {
    // HEIC and some exotic formats will not decode in every browser. The upload
    // still works; the picture just starts square until it is resized.
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = items.find((item) => item.id === selectedId) ?? null;

  function patch(changes: Partial<PlacedMedia>) {
    if (!selected) return;
    onChange(items.map((item) => (item.id === selected.id ? { ...item, ...changes } : item)));
  }

  async function upload(files: FileList) {
    setError(null);
    setUploading(true);

    try {
      const added: PlacedMedia[] = [];

      for (const file of Array.from(files).slice(0, 10)) {
        const size = await readImageSize(file);

        const form = new FormData();
        form.set("bookId", bookId);
        if (entryId) form.set("entryId", entryId);
        form.set("file", file);
        if (size) {
          form.set("width", String(size.width));
          form.set("height", String(size.height));
        }

        const response = await fetch("/api/attachments/upload", { method: "POST", body: form });
        const result = (await response.json()) as
          | { id: string; path: string; url: string | null }
          | { error: string };

        if (!response.ok || "error" in result) {
          setError("error" in result ? result.error : "Could not upload that image.");
          continue;
        }

        if (result.url) onAddUrl(result.path, result.url);

        added.push({
          ...DEFAULT_PLACEMENT,
          id: crypto.randomUUID(),
          attachmentId: result.id,
          path: result.path,
          aspect: size ? size.height / size.width : 1,
          // Stagger so several at once do not land exactly on top of each other.
          x: 0.08 + added.length * 0.05,
          y: 0.06 + added.length * 0.05,
        });
      }

      if (added.length > 0) {
        onChange([...items, ...added]);
        onSelect(added.at(-1)!.id);
      }
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-base text-ink">Photographs</h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            Drag to move, or use the arrow keys. Everything stays private to this book.
          </p>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic"
          multiple
          className="sr-only"
          onChange={(event) => {
            if (event.target.files?.length) void upload(event.target.files);
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
              onClick={() => patch({ rotation: 0, x: 0.08, y: 0.06, width: 0.42 })}
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
