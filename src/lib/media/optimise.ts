"use client";

/**
 * Shrinking a photograph before it leaves the phone.
 *
 * A picture straight out of a camera is 4000 pixels wide and several megabytes.
 * Nothing in this book can use that: the widest a photograph is ever printed is
 * one page, and A5 at 300dpi is about 1750 pixels. Uploading the original costs
 * the writer their data allowance, costs the book its storage quota, and costs
 * every reader the download — to show them pixels no screen or press will
 * resolve.
 *
 * So the work happens here, in the browser, before the upload starts:
 *
 *   * The long edge comes down to `MAX_EDGE`, which leaves headroom above what
 *     a full-page print at 300dpi actually needs.
 *   * The result is re-encoded as WebP, which is markedly smaller than JPEG at
 *     the same quality and is supported everywhere this application runs.
 *   * EXIF orientation is *baked in*. Phone photographs carry "actually, rotate
 *     me 90°" as metadata, which a canvas would otherwise throw away — this is
 *     why re-encoded holiday pictures so often come out sideways.
 *
 * Three cases deliberately keep the original file:
 *
 *   * GIFs, because re-encoding a frame throws the animation away.
 *   * Anything the browser cannot decode, notably HEIC on non-Apple platforms.
 *     The upload still works; it is simply not made smaller.
 *   * Anything already smaller than the version we produced, which happens with
 *     screenshots and with pictures somebody has already compressed.
 */

/** Long edge, in pixels. Comfortably above a full-page 300dpi print. */
const MAX_EDGE = 2400;
const QUALITY = 0.85;

export type PreparedImage = {
  /** What to actually upload. The original, when shrinking would not help. */
  file: File;
  /** Pixel size of `file`, or null when the browser could not decode it. */
  width: number | null;
  height: number | null;
  /** Size of what the writer chose, so the saving can be reported honestly. */
  originalBytes: number;
};

function untouched(file: File, size: { width: number; height: number } | null): PreparedImage {
  return {
    file,
    width: size?.width ?? null,
    height: size?.height ?? null,
    originalBytes: file.size,
  };
}

/**
 * Decode to a bitmap, with EXIF rotation applied.
 *
 * `createImageBitmap` decodes off the main thread, so a page of photographs does
 * not lock up the interface the way a series of `<img>` loads would.
 */
async function decode(file: File): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // HEIC on Windows and Android, and any file that is not really an image.
    return null;
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  // Animation is worth more than the bytes it costs.
  if (file.type === "image/gif") return untouched(file, null);

  const bitmap = await decode(file);
  if (!bitmap) return untouched(file, null);

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return untouched(file, { width: bitmap.width, height: bitmap.height });

    // Browsers default to a fast, ugly downscale. This is the one knob that
    // decides whether a shrunk photograph looks resampled or looks bad.
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await toBlob(canvas, "image/webp");

    // No saving to be had — keep the writer's own file rather than a
    // re-encoded copy that is bigger and has been through a lossy pass.
    if (!blob || blob.size >= file.size) {
      return untouched(file, { width: bitmap.width, height: bitmap.height });
    }

    return {
      file: new File([blob], "photograph.webp", { type: "image/webp" }),
      width,
      height,
      originalBytes: file.size,
    };
  } finally {
    // The decoded bitmap holds the full-size pixels; ten of these is hundreds
    // of megabytes if nothing lets them go.
    bitmap.close();
  }
}

/** "4.2 MB", for telling somebody what their photograph weighs. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
