import "server-only";

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import { formatLongDate } from "@/lib/date/calendar-date";

import type { ExportBlock, ExportDocument, ExportRun } from "./document";

/**
 * PDF export.
 *
 * Uses only the PDF base-14 fonts (Times, Helvetica, Courier). That is a
 * deliberate trade: the book's screen typeface is mapped to its nearest printed
 * relative rather than embedded, which keeps exports fast and the files small,
 * and means a ten-year book never fails to generate because a webfont could not
 * be fetched. Each book's design still chooses between a serif, a sans and a
 * typewriter face, and the layout — margins, leading, chapter dates, page
 * numbers — is what actually makes it look like a book.
 */

const PAGE_SIZES = {
  A4: "A4",
  A5: "A5",
  LETTER: "LETTER",
  // Digest, the common trim for a printed paperback: 5.5in x 8.5in at 72dpi.
  DIGEST: { width: 396, height: 612 },
} as const;

export async function renderBookPdf(doc: ExportDocument): Promise<Uint8Array> {
  const base = doc.design.bodyFont.pdfFallback;
  const heading = doc.design.headingFont.pdfFallback;

  // Scale the screen size down slightly: 18px on a monitor is large in print.
  const fontSize = Math.max(9, Math.min(14, doc.design.baseSize * 0.62));
  const size = PAGE_SIZES[doc.design.pageSize];
  const compact = doc.design.pageSize === "A5" || doc.design.pageSize === "DIGEST";

  const styles = StyleSheet.create({
    page: {
      fontFamily: base,
      fontSize,
      lineHeight: doc.design.lineHeight,
      color: "#1a1a1a",
      paddingTop: compact ? 48 : 64,
      paddingBottom: compact ? 56 : 72,
      paddingHorizontal: compact ? 46 : 72,
    },
    coverPage: {
      fontFamily: heading,
      paddingTop: compact ? 120 : 170,
      paddingHorizontal: compact ? 50 : 80,
      color: "#1a1a1a",
    },
    coverTitle: { fontSize: compact ? 26 : 34, textAlign: "center", lineHeight: 1.25 },
    coverSubtitle: {
      fontSize: compact ? 12 : 14,
      textAlign: "center",
      marginTop: 14,
      color: "#4a4a4a",
    },
    coverRule: {
      borderBottomWidth: 0.75,
      borderBottomColor: "#8a8a8a",
      width: 90,
      alignSelf: "center",
      marginVertical: 26,
    },
    coverContributors: {
      fontSize: compact ? 10 : 11,
      textAlign: "center",
      letterSpacing: 1.6,
      textTransform: "uppercase",
      color: "#3a3a3a",
    },
    coverMeta: {
      position: "absolute",
      bottom: 56,
      left: 0,
      right: 0,
      textAlign: "center",
      fontSize: 8,
      color: "#7a7a7a",
      fontFamily: base,
    },
    dayHeading: {
      fontFamily: heading,
      fontSize: fontSize * 0.82,
      letterSpacing: 2,
      textTransform: "uppercase",
      textAlign: doc.design.preset.dateStyle === "centered" ? "center" : "left",
      color: "#5a5a5a",
      marginTop: 26,
      marginBottom: 14,
    },
    author: {
      fontSize: fontSize * 0.8,
      color: "#5a5a5a",
      marginBottom: 5,
      marginTop: 12,
    },
    entryTitle: {
      fontFamily: heading,
      // The book's own setting, so a printed copy matches what is on screen.
      fontSize: fontSize * doc.design.titleSize,
      // The base-14 PDF fonts have exactly two weights, so anything the reader
      // called semibold or heavier prints bold and everything else prints
      // regular. Better an honest approximation than silently ignoring it.
      fontWeight: doc.design.titleWeight >= 600 ? "bold" : "normal",
      marginBottom: 6,
    },
    paragraph: { marginBottom: doc.design.preset.indentParagraphs ? 0 : fontSize * 0.6 },
    indented: { textIndent: fontSize * 1.4 },
    heading1: { fontFamily: heading, fontSize: fontSize * 1.35, marginTop: 10, marginBottom: 5 },
    heading2: { fontFamily: heading, fontSize: fontSize * 1.2, marginTop: 9, marginBottom: 4 },
    heading3: { fontFamily: heading, fontSize: fontSize * 1.08, marginTop: 8, marginBottom: 4 },
    quote: {
      marginLeft: 16,
      marginBottom: fontSize * 0.6,
      paddingLeft: 10,
      borderLeftWidth: 1,
      borderLeftColor: "#c8c8c8",
      color: "#3a3a3a",
    },
    listItem: { marginBottom: 3, marginLeft: 14 },
    rule: {
      borderBottomWidth: 0.5,
      borderBottomColor: "#c8c8c8",
      marginVertical: 14,
      width: 60,
      alignSelf: "center",
    },
    correctedNote: { fontSize: fontSize * 0.7, color: "#8a8a8a", marginTop: 4 },
    pageNumber: {
      position: "absolute",
      bottom: compact ? 28 : 36,
      left: 0,
      right: 0,
      textAlign: "center",
      fontSize: 8.5,
      color: "#7a7a7a",
    },
  });

  function renderRuns(runs: ExportRun[]) {
    return runs.map((run, index) => (
      <Text
        key={index}
        style={{
          fontWeight: run.bold ? "bold" : undefined,
          fontStyle: run.italic ? "italic" : undefined,
          textDecoration: run.underline ? "underline" : undefined,
        }}
      >
        {run.text}
      </Text>
    ));
  }

  function renderBlock(block: ExportBlock, key: string, isFirstOfEntry: boolean) {
    if (block.type === "rule") return <View key={key} style={styles.rule} />;

    if (block.type === "heading") {
      const style =
        block.level === 1 ? styles.heading1 : block.level === 2 ? styles.heading2 : styles.heading3;
      return (
        <Text key={key} style={style}>
          {renderRuns(block.runs)}
        </Text>
      );
    }

    if (block.type === "quote") {
      return (
        <Text key={key} style={styles.quote}>
          {renderRuns(block.runs)}
        </Text>
      );
    }

    if (block.type === "listItem") {
      return (
        <Text key={key} style={styles.listItem}>
          {block.ordered ? "— " : "• "}
          {renderRuns(block.runs)}
        </Text>
      );
    }

    // Printed novels indent every paragraph except the first of a section.
    const indent = doc.design.preset.indentParagraphs && !isFirstOfEntry;
    return (
      <Text
        key={key}
        style={[styles.paragraph, indent ? styles.indented : {}, { textAlign: block.align ?? "left" }]}
      >
        {renderRuns(block.runs)}
      </Text>
    );
  }

  const element = (
    <Document
      title={doc.title}
      author={doc.contributors.join(", ")}
      creator="Journal & Letter"
      producer="Journal & Letter"
    >
      {doc.includeCover ? (
        <Page size={size} style={styles.coverPage}>
          <Text style={styles.coverTitle}>{doc.title}</Text>
          {doc.subtitle ? <Text style={styles.coverSubtitle}>{doc.subtitle}</Text> : null}
          <View style={styles.coverRule} />
          <Text style={styles.coverContributors}>{doc.contributors.join(" · ")}</Text>
          {doc.dateRangeLabel ? (
            <Text style={[styles.coverSubtitle, { marginTop: 22, fontSize: 10 }]}>
              {doc.dateRangeLabel}
            </Text>
          ) : null}
          <Text style={styles.coverMeta} fixed>
            {doc.textVersion === "original"
              ? "Printed from the original writing, exactly as written."
              : "Printed from the current text, including accepted corrections."}
          </Text>
        </Page>
      ) : null}

      <Page size={size} style={styles.page}>
        {doc.days.map((day) => (
          // `wrap` lets a long day flow across pages instead of overflowing.
          <View key={day.date} wrap>
            <Text style={styles.dayHeading} minPresenceAhead={40}>
              {formatLongDate(day.date)}
            </Text>

            {day.entries.map((entry) => (
              <View key={entry.id} wrap>
                <Text style={styles.author}>{entry.authorName}</Text>
                {entry.title ? <Text style={styles.entryTitle}>{entry.title}</Text> : null}

                {entry.blocks.length === 0 ? (
                  <Text style={styles.paragraph}> </Text>
                ) : (
                  entry.blocks.map((block, index) =>
                    renderBlock(block, `${entry.id}-${index}`, index === 0),
                  )
                )}

                {entry.corrected ? (
                  <Text style={styles.correctedNote}>Lightly corrected.</Text>
                ) : null}
              </View>
            ))}
          </View>
        ))}

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );

  // `renderToBuffer` returns a Node Buffer, which is a Uint8Array.
  const buffer = await renderToBuffer(element);
  return new Uint8Array(buffer);
}

/** A rough page estimate for the export screen, before anything is generated. */
export function estimatePageCount(doc: ExportDocument): number {
  const words = doc.days.reduce(
    (sum, day) =>
      sum +
      day.entries.reduce(
        (entrySum, entry) =>
          entrySum +
          entry.blocks.reduce(
            (blockSum, block) =>
              blockSum +
              (block.type === "rule"
                ? 0
                : block.runs.map((run) => run.text).join("").trim().split(/\s+/).filter(Boolean)
                    .length),
            0,
          ),
        0,
      ),
    0,
  );

  const wordsPerPage =
    doc.design.pageSize === "A4" || doc.design.pageSize === "LETTER" ? 450 : 280;
  return Math.max(1, Math.ceil(words / wordsPerPage)) + (doc.includeCover ? 1 : 0);
}
