import "server-only";

import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

import { formatLongDate } from "@/lib/date/calendar-date";

import type { ExportBlock, ExportDocument, ExportRun } from "./document";

/**
 * DOCX export.
 *
 * A real Word document, not an HTML file with a .doc extension. That matters
 * because the stated purpose is to hand this to a printer or open it in Google
 * Docs — both of which will reject the latter and mangle its formatting.
 *
 * Fonts are named rather than embedded, so the file opens sensibly on a machine
 * that has never heard of this application.
 */

function toTextRuns(runs: ExportRun[], font: string, size: number): TextRun[] {
  return runs.flatMap((run) => {
    // A hard break inside a paragraph becomes a real line break, not a space.
    const segments = run.text.split("\n");
    return segments.map(
      (segment, index) =>
        new TextRun({
          text: segment,
          bold: run.bold,
          italics: run.italic,
          underline: run.underline ? {} : undefined,
          font,
          size,
          break: index > 0 ? 1 : undefined,
        }),
    );
  });
}

export async function renderBookDocx(doc: ExportDocument): Promise<Uint8Array> {
  const bodyFont = doc.design.bodyFont.docxFont;
  const headingFont = doc.design.headingFont.docxFont;

  // `docx` measures in half-points.
  const bodySize = Math.round(Math.max(9, Math.min(14, doc.design.baseSize * 0.62)) * 2);
  // Line spacing is in twentieths of a point.
  const lineSpacing = Math.round(doc.design.lineHeight * 240);

  const children: Paragraph[] = [];

  if (doc.includeCover) {
    children.push(
      new Paragraph({ spacing: { before: 2400 } }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: doc.title, font: headingFont, size: 56, bold: false })],
      }),
    );

    if (doc.subtitle) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 240 },
          children: [new TextRun({ text: doc.subtitle, font: headingFont, size: 26 })],
        }),
      );
    }

    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 600 },
        children: [
          new TextRun({
            text: doc.contributors.join("  ·  ").toUpperCase(),
            font: bodyFont,
            size: 20,
          }),
        ],
      }),
    );

    if (doc.dateRangeLabel) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 240 },
          children: [new TextRun({ text: doc.dateRangeLabel, font: bodyFont, size: 20 })],
        }),
      );
    }

    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 1200 },
        children: [
          new TextRun({
            text:
              doc.textVersion === "original"
                ? "Printed from the original writing, exactly as written."
                : "Printed from the current text, including accepted corrections.",
            font: bodyFont,
            size: 16,
            color: "777777",
          }),
        ],
      }),
      new Paragraph({ children: [new PageBreak()] }),
    );
  }

  const renderBlock = (block: ExportBlock, isFirstOfEntry: boolean): Paragraph => {
    if (block.type === "rule") {
      return new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 240 },
        children: [new TextRun({ text: "· · ·", font: bodyFont, size: bodySize })],
      });
    }

    if (block.type === "heading") {
      return new Paragraph({
        heading:
          block.level === 1
            ? HeadingLevel.HEADING_2
            : block.level === 2
              ? HeadingLevel.HEADING_3
              : HeadingLevel.HEADING_4,
        spacing: { before: 200, after: 100 },
        children: toTextRuns(block.runs, headingFont, Math.round(bodySize * 1.15)),
      });
    }

    if (block.type === "quote") {
      return new Paragraph({
        indent: { left: 480 },
        spacing: { line: lineSpacing, after: 120 },
        children: toTextRuns(
          block.runs.map((run) => ({ ...run, italic: true })),
          bodyFont,
          bodySize,
        ),
      });
    }

    if (block.type === "listItem") {
      return new Paragraph({
        bullet: block.ordered ? undefined : { level: 0 },
        numbering: undefined,
        indent: block.ordered ? { left: 480, hanging: 240 } : undefined,
        spacing: { line: lineSpacing, after: 60 },
        children: block.ordered
          ? [
              new TextRun({ text: "— ", font: bodyFont, size: bodySize }),
              ...toTextRuns(block.runs, bodyFont, bodySize),
            ]
          : toTextRuns(block.runs, bodyFont, bodySize),
      });
    }

    return new Paragraph({
      alignment:
        block.align === "center"
          ? AlignmentType.CENTER
          : block.align === "right"
            ? AlignmentType.RIGHT
            : AlignmentType.LEFT,
      spacing: {
        line: lineSpacing,
        after: doc.design.preset.indentParagraphs ? 0 : 140,
      },
      indent:
        doc.design.preset.indentParagraphs && !isFirstOfEntry ? { firstLine: 340 } : undefined,
      children: toTextRuns(block.runs, bodyFont, bodySize),
    });
  };

  for (const day of doc.days) {
    children.push(
      new Paragraph({
        alignment:
          doc.design.preset.dateStyle === "centered" ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { before: 480, after: 240 },
        children: [
          new TextRun({
            text: formatLongDate(day.date).toUpperCase(),
            font: headingFont,
            size: Math.round(bodySize * 0.85),
            characterSpacing: 40,
            color: "555555",
          }),
        ],
      }),
    );

    for (const entry of day.entries) {
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 80 },
          children: [
            new TextRun({
              text: entry.authorName,
              font: bodyFont,
              size: Math.round(bodySize * 0.85),
              color: "555555",
            }),
          ],
        }),
      );

      if (entry.title) {
        children.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: entry.title,
                font: headingFont,
                size: Math.round(bodySize * 1.15),
              }),
            ],
          }),
        );
      }

      if (entry.blocks.length === 0) {
        children.push(new Paragraph({ children: [] }));
      } else {
        entry.blocks.forEach((block, index) => children.push(renderBlock(block, index === 0)));
      }

      if (entry.corrected) {
        children.push(
          new Paragraph({
            spacing: { before: 60 },
            children: [
              new TextRun({
                text: "Lightly corrected.",
                font: bodyFont,
                size: Math.round(bodySize * 0.75),
                color: "999999",
                italics: true,
              }),
            ],
          }),
        );
      }
    }
  }

  const document = new Document({
    title: doc.title,
    description: doc.subtitle ?? undefined,
    creator: doc.contributors.join(", "),
    sections: [
      {
        properties: {},
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: bodyFont,
                    size: 16,
                    color: "888888",
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);
  return new Uint8Array(buffer);
}
