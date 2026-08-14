import { describe, expect, it } from "vitest";

import { exportFilename } from "@/lib/export/compile";
import type { ExportDocument } from "@/lib/export/document";
import { renderBookDocx } from "@/lib/export/docx";
import { estimatePageCount, renderBookPdf } from "@/lib/export/pdf";
import { DEFAULT_DESIGN, resolveDesign } from "@/lib/design/theme";
import { fromPlainText } from "@/lib/text/rich-text";
import { toExportBlocks } from "@/lib/export/document";

/**
 * Export really does produce files.
 *
 * The point of this product is that years of writing turn into something
 * printable, so "the PDF generates" is a claim worth checking rather than
 * assuming. These run the real renderers.
 */

function sampleDocument(overrides: Partial<ExportDocument> = {}): ExportDocument {
  return {
    title: "Our Letters",
    subtitle: "Hong Kong and London",
    contributors: ["Murathan", "Rossi"],
    dateRangeLabel: "14 August 2026",
    design: resolveDesign(DEFAULT_DESIGN),
    includeCover: true,
    textVersion: "current",
    generatedAt: "2026-08-14T00:00:00.000Z",
    days: [
      {
        date: "2026-08-14",
        entries: [
          {
            id: "entry-1",
            authorName: "Murathan",
            title: null,
            blocks: toExportBlocks(fromPlainText("Good morning askim.\n\nIt rained all night.")),
            corrected: false,
          },
          {
            id: "entry-2",
            authorName: "Rossi",
            title: "Before the alarm",
            blocks: toExportBlocks(fromPlainText("I woke up early again.")),
            corrected: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("PDF export", () => {
  it("produces a real PDF", async () => {
    const bytes = await renderBookPdf(sampleDocument());

    // %PDF
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x25, 0x50, 0x44, 0x46]);
    expect(bytes.byteLength).toBeGreaterThan(1000);
  }, 60_000);

  it("renders every page size the settings offer", async () => {
    for (const pageSize of ["A5", "A4", "LETTER", "DIGEST"] as const) {
      const doc = sampleDocument({
        design: resolveDesign({ ...DEFAULT_DESIGN, pageSize }),
      });
      const bytes = await renderBookPdf(doc);
      expect(bytes.byteLength).toBeGreaterThan(1000);
    }
  }, 120_000);

  it("copes with an entry that has no blocks at all", async () => {
    const doc = sampleDocument({
      days: [
        {
          date: "2026-08-14",
          entries: [
            { id: "empty", authorName: "Murathan", title: null, blocks: [], corrected: false },
          ],
        },
      ],
    });

    await expect(renderBookPdf(doc)).resolves.toBeInstanceOf(Uint8Array);
  }, 60_000);

  it("estimates more pages for more writing", () => {
    const small = estimatePageCount(sampleDocument());
    const large = estimatePageCount(
      sampleDocument({
        days: Array.from({ length: 40 }, (_, index) => ({
          date: `2026-08-${String((index % 28) + 1).padStart(2, "0")}`,
          entries: [
            {
              id: `e${index}`,
              authorName: "Murathan",
              title: null,
              blocks: toExportBlocks(fromPlainText("word ".repeat(300))),
              corrected: false,
            },
          ],
        })),
      }),
    );

    expect(large).toBeGreaterThan(small);
    expect(small).toBeGreaterThanOrEqual(1);
  });
});

describe("DOCX export", () => {
  it("produces a real .docx (a zip container)", async () => {
    const bytes = await renderBookDocx(sampleDocument());

    // "PK\x03\x04" — the zip local file header every OOXML file starts with.
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(bytes.byteLength).toBeGreaterThan(1000);
  }, 60_000);

  it("still builds without a title page", async () => {
    const bytes = await renderBookDocx(sampleDocument({ includeCover: false }));
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]);
  }, 60_000);
});

describe("exportFilename", () => {
  it("makes a filesystem-safe name that still looks like the book", () => {
    expect(exportFilename("Our Letters", "pdf")).toBe("our-letters.pdf");
    // Punctuation is dropped and the resulting run of spaces collapses to one
    // hyphen, so "Rossi & Murat: 2026" does not become "rossi--murat".
    expect(exportFilename("Rossi & Murat: 2026", "docx")).toBe("rossi-murat-2026.docx");
  });

  it("falls back when the title has nothing usable in it", () => {
    expect(exportFilename("💌", "pdf")).toBe("book.pdf");
    expect(exportFilename("   ", "pdf")).toBe("book.pdf");
  });

  it("keeps the name to a sensible length", () => {
    const name = exportFilename("a".repeat(200), "pdf");
    expect(name.length).toBeLessThanOrEqual(64);
  });
});
