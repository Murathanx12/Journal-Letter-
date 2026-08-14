/**
 * The book's visual language.
 *
 * Two principles shaped this file:
 *
 *  1. A *curated* set of good choices beats an infinite one. Six fonts, six
 *     presets, six accents. Every combination is meant to look like a book
 *     somebody would want on a shelf.
 *
 *  2. Author identity must never cost readability. Writers are told apart by
 *     typeface, a signature and a *small* accent used on rules and names — never
 *     by colouring the body text itself. Two people's letters sit on the same
 *     page in the same ink, exactly as they would in print.
 */

export type FontId = "literata" | "lora" | "cormorant" | "inter" | "courier-prime" | "caveat";

export type FontDefinition = {
  id: FontId;
  /** Shown in the picker. */
  label: string;
  /** One line on when to reach for it. */
  description: string;
  /** CSS variable declared by next/font in the root layout. */
  cssVariable: string;
  /** Fallback stack, used before the webfont lands and inside exports. */
  stack: string;
  category: "serif" | "sans" | "mono" | "handwriting";
  /**
   * The closest of the 14 PDF base-14 fonts. @react-pdf/renderer can rely on
   * these without embedding anything, which keeps exports fast and small.
   */
  pdfFallback: "Times-Roman" | "Helvetica" | "Courier";
  /** Nearest common desktop font, so DOCX opens sensibly in Word and Docs. */
  docxFont: string;
};

export const FONTS: Record<FontId, FontDefinition> = {
  literata: {
    id: "literata",
    label: "Literata",
    description: "A warm, sturdy book serif. The default for a reason.",
    cssVariable: "--font-literata",
    stack: "var(--font-literata), Georgia, 'Times New Roman', serif",
    category: "serif",
    pdfFallback: "Times-Roman",
    docxFont: "Georgia",
  },
  lora: {
    id: "lora",
    label: "Lora",
    description: "Slightly calligraphic. Reads beautifully at length.",
    cssVariable: "--font-lora",
    stack: "var(--font-lora), Georgia, serif",
    category: "serif",
    pdfFallback: "Times-Roman",
    docxFont: "Georgia",
  },
  cormorant: {
    id: "cormorant",
    label: "Cormorant",
    description: "High contrast and romantic. Best at a larger size.",
    cssVariable: "--font-cormorant",
    stack: "var(--font-cormorant), 'Garamond', Georgia, serif",
    category: "serif",
    pdfFallback: "Times-Roman",
    docxFont: "Garamond",
  },
  inter: {
    id: "inter",
    label: "Inter",
    description: "Clean and modern. Quiet on the page.",
    cssVariable: "--font-inter",
    stack: "var(--font-inter), system-ui, -apple-system, 'Segoe UI', sans-serif",
    category: "sans",
    pdfFallback: "Helvetica",
    docxFont: "Calibri",
  },
  "courier-prime": {
    id: "courier-prime",
    label: "Courier Prime",
    description: "Typewriter. Deliberate and a little nostalgic.",
    cssVariable: "--font-courier-prime",
    stack: "var(--font-courier-prime), 'Courier New', monospace",
    category: "mono",
    pdfFallback: "Courier",
    docxFont: "Courier New",
  },
  caveat: {
    id: "caveat",
    label: "Caveat",
    description: "Handwriting. Lovely for signatures, tiring for whole letters.",
    cssVariable: "--font-caveat",
    stack: "var(--font-caveat), 'Segoe Script', cursive",
    category: "handwriting",
    pdfFallback: "Helvetica",
    docxFont: "Segoe Script",
  },
};

export const FONT_IDS = Object.keys(FONTS) as FontId[];

export function isFontId(value: string): value is FontId {
  return value in FONTS;
}

export function getFont(value: string | null | undefined): FontDefinition {
  return value && isFontId(value) ? FONTS[value] : FONTS.literata;
}

// -----------------------------------------------------------------------------
// Typography presets
// -----------------------------------------------------------------------------

export type PresetId =
  | "classic-novel"
  | "modern-minimal"
  | "romantic"
  | "academic-journal"
  | "typewriter"
  | "handwritten";

export type TypographyPreset = {
  id: PresetId;
  label: string;
  description: string;
  bodyFont: FontId;
  headingFont: FontId;
  /** Body size in px at desktop width. */
  baseSize: number;
  lineHeight: number;
  /** How a day's chapter heading is rendered. */
  dateStyle: "smallcaps" | "plain" | "underlined" | "centered";
  /** Indent paragraphs instead of spacing them, as printed novels do. */
  indentParagraphs: boolean;
};

export const PRESETS: Record<PresetId, TypographyPreset> = {
  "classic-novel": {
    id: "classic-novel",
    label: "Classic Novel",
    description: "Indented paragraphs, generous leading, quiet chapter dates.",
    bodyFont: "literata",
    headingFont: "literata",
    baseSize: 18,
    lineHeight: 1.75,
    dateStyle: "centered",
    indentParagraphs: true,
  },
  "modern-minimal": {
    id: "modern-minimal",
    label: "Modern Minimal",
    description: "Sans-serif, plenty of white space, nothing decorative.",
    bodyFont: "inter",
    headingFont: "inter",
    baseSize: 17,
    lineHeight: 1.7,
    dateStyle: "plain",
    indentParagraphs: false,
  },
  romantic: {
    id: "romantic",
    label: "Romantic",
    description: "A high-contrast serif set large, with centred dates.",
    bodyFont: "cormorant",
    headingFont: "cormorant",
    baseSize: 21,
    lineHeight: 1.7,
    dateStyle: "centered",
    indentParagraphs: false,
  },
  "academic-journal": {
    id: "academic-journal",
    label: "Academic Journal",
    description: "Tighter, more formal, ruled dates. Good for daily records.",
    bodyFont: "lora",
    headingFont: "inter",
    baseSize: 16,
    lineHeight: 1.65,
    dateStyle: "underlined",
    indentParagraphs: false,
  },
  typewriter: {
    id: "typewriter",
    label: "Typewriter",
    description: "Monospaced and evenly grey, like a carbon copy.",
    bodyFont: "courier-prime",
    headingFont: "courier-prime",
    baseSize: 16,
    lineHeight: 1.8,
    dateStyle: "smallcaps",
    indentParagraphs: false,
  },
  handwritten: {
    id: "handwritten",
    label: "Handwritten",
    description: "Handwriting for the dates and names, a readable serif beneath.",
    bodyFont: "literata",
    headingFont: "caveat",
    baseSize: 18,
    lineHeight: 1.8,
    dateStyle: "centered",
    indentParagraphs: false,
  },
};

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

export function isPresetId(value: string): value is PresetId {
  return value in PRESETS;
}

export function getPreset(value: string | null | undefined): TypographyPreset {
  return value && isPresetId(value) ? PRESETS[value] : PRESETS["classic-novel"];
}

// -----------------------------------------------------------------------------
// Author accents
//
// Muted on purpose. These appear on a name, a short rule and a signature — never
// behind or on the body text — so contrast stays well clear of WCAG minimums and
// nobody's letters become hard to read.
// -----------------------------------------------------------------------------

export type AccentId = "ink" | "indigo" | "teal" | "plum" | "rose" | "moss";

export type AccentDefinition = {
  id: AccentId;
  label: string;
  light: string;
  dark: string;
};

export const ACCENTS: Record<AccentId, AccentDefinition> = {
  ink: { id: "ink", label: "Ink", light: "#3a3a45", dark: "#b8b8c6" },
  indigo: { id: "indigo", label: "Indigo", light: "#3345c2", dark: "#96a9ff" },
  teal: { id: "teal", label: "Teal", light: "#0f6f68", dark: "#5cc9bf" },
  plum: { id: "plum", label: "Plum", light: "#6b3f74", dark: "#cba6d6" },
  rose: { id: "rose", label: "Rose", light: "#a83a5b", dark: "#f0a0b6" },
  moss: { id: "moss", label: "Moss", light: "#4a6b3a", dark: "#a8c893" },
};

export const ACCENT_IDS = Object.keys(ACCENTS) as AccentId[];

export function isAccentId(value: string): value is AccentId {
  return value in ACCENTS;
}

export function getAccent(value: string | null | undefined): AccentDefinition {
  return value && isAccentId(value) ? ACCENTS[value] : ACCENTS.ink;
}

// -----------------------------------------------------------------------------
// Covers
// -----------------------------------------------------------------------------

export type CoverPresetId =
  | "paper"
  | "midnight"
  | "sage"
  | "dusk"
  | "letterpress"
  | "ink";

export type CoverPreset = {
  id: CoverPresetId;
  label: string;
  /** Any valid CSS background value. */
  background: string;
  /** Text colour that sits on that background. */
  foreground: string;
  /** Hairline rule / border colour for the cover frame. */
  rule: string;
};

export const COVER_PRESETS: Record<CoverPresetId, CoverPreset> = {
  paper: {
    id: "paper",
    label: "Paper",
    background: "linear-gradient(160deg, #f7f7f3 0%, #e7e7e1 100%)",
    foreground: "#26262b",
    rule: "rgba(38, 38, 43, 0.32)",
  },
  midnight: {
    id: "midnight",
    label: "Midnight",
    background: "linear-gradient(160deg, #1c1c26 0%, #0c0c11 100%)",
    foreground: "#eaeaf0",
    rule: "rgba(234, 234, 240, 0.32)",
  },
  sage: {
    id: "sage",
    label: "Sage",
    background: "linear-gradient(160deg, #e4ece6 0%, #c6d6ca 100%)",
    foreground: "#27362c",
    rule: "rgba(39, 54, 44, 0.32)",
  },
  dusk: {
    id: "dusk",
    label: "Dusk",
    background: "linear-gradient(160deg, #eae2f0 0%, #bfb2d2 100%)",
    foreground: "#2f2740",
    rule: "rgba(47, 39, 64, 0.32)",
  },
  letterpress: {
    id: "letterpress",
    label: "Letterpress",
    background: "linear-gradient(160deg, #fcfcfa 0%, #eeeeea 100%)",
    foreground: "#1f1f24",
    rule: "rgba(31, 31, 36, 0.35)",
  },
  ink: {
    id: "ink",
    label: "Ink",
    background: "linear-gradient(160deg, #26346f 0%, #121838 100%)",
    foreground: "#eef1ff",
    rule: "rgba(238, 241, 255, 0.34)",
  },
};

export const COVER_PRESET_IDS = Object.keys(COVER_PRESETS) as CoverPresetId[];

export function isCoverPresetId(value: string): value is CoverPresetId {
  return value in COVER_PRESETS;
}

export function getCoverPreset(value: string | null | undefined): CoverPreset {
  return value && isCoverPresetId(value) ? COVER_PRESETS[value] : COVER_PRESETS.paper;
}

// -----------------------------------------------------------------------------
// Structured JSON columns
//
// `books.cover` and `books.design` are jsonb. These parsers turn whatever is in
// the column into a complete, valid object so a hand-edited or older row can
// never blank out a page.
// -----------------------------------------------------------------------------

export type BookCover = {
  preset: CoverPresetId;
  /** Storage path inside `book-media`, when the reader uploaded their own. */
  imagePath: string | null;
};

export type BookDesign = {
  preset: PresetId;
  /** Overrides on top of the preset. Null means "inherit from the preset". */
  bodyFont: FontId | null;
  headingFont: FontId | null;
  baseSize: number | null;
  lineHeight: number | null;
  /** Show each writer's chosen font for their own entries. */
  perAuthorFonts: boolean;
  showSignatures: boolean;
  /** Page size used by PDF export. */
  pageSize: "A5" | "A4" | "LETTER" | "DIGEST";
};

export const DEFAULT_COVER: BookCover = { preset: "paper", imagePath: null };

export const DEFAULT_DESIGN: BookDesign = {
  preset: "classic-novel",
  bodyFont: null,
  headingFont: null,
  baseSize: null,
  lineHeight: null,
  perAuthorFonts: true,
  showSignatures: true,
  pageSize: "A5",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseCover(value: unknown): BookCover {
  const raw = asRecord(value);
  const preset = typeof raw.preset === "string" && isCoverPresetId(raw.preset) ? raw.preset : DEFAULT_COVER.preset;
  const imagePath = typeof raw.imagePath === "string" && raw.imagePath.length > 0 ? raw.imagePath : null;
  return { preset, imagePath };
}

export function parseDesign(value: unknown): BookDesign {
  const raw = asRecord(value);
  const preset = typeof raw.preset === "string" && isPresetId(raw.preset) ? raw.preset : DEFAULT_DESIGN.preset;
  const bodyFont = typeof raw.bodyFont === "string" && isFontId(raw.bodyFont) ? raw.bodyFont : null;
  const headingFont = typeof raw.headingFont === "string" && isFontId(raw.headingFont) ? raw.headingFont : null;
  const baseSize = typeof raw.baseSize === "number" && raw.baseSize >= 13 && raw.baseSize <= 26 ? raw.baseSize : null;
  const lineHeight =
    typeof raw.lineHeight === "number" && raw.lineHeight >= 1.3 && raw.lineHeight <= 2.4 ? raw.lineHeight : null;
  const pageSize =
    raw.pageSize === "A4" || raw.pageSize === "LETTER" || raw.pageSize === "DIGEST" || raw.pageSize === "A5"
      ? raw.pageSize
      : DEFAULT_DESIGN.pageSize;

  return {
    preset,
    bodyFont,
    headingFont,
    baseSize,
    lineHeight,
    perAuthorFonts: raw.perAuthorFonts !== false,
    showSignatures: raw.showSignatures !== false,
    pageSize,
  };
}

/** The design actually used for rendering, with preset defaults filled in. */
export type ResolvedDesign = {
  preset: TypographyPreset;
  bodyFont: FontDefinition;
  headingFont: FontDefinition;
  baseSize: number;
  lineHeight: number;
  perAuthorFonts: boolean;
  showSignatures: boolean;
  pageSize: BookDesign["pageSize"];
};

export function resolveDesign(design: BookDesign): ResolvedDesign {
  const preset = PRESETS[design.preset];
  return {
    preset,
    bodyFont: FONTS[design.bodyFont ?? preset.bodyFont],
    headingFont: FONTS[design.headingFont ?? preset.headingFont],
    baseSize: design.baseSize ?? preset.baseSize,
    lineHeight: design.lineHeight ?? preset.lineHeight,
    perAuthorFonts: design.perAuthorFonts,
    showSignatures: design.showSignatures,
    pageSize: design.pageSize,
  };
}

/** CSS custom properties for the reading surface. */
export function designToCssVars(design: ResolvedDesign): Record<string, string> {
  return {
    "--book-body-font": design.bodyFont.stack,
    "--book-heading-font": design.headingFont.stack,
    "--book-base-size": `${design.baseSize}px`,
    "--book-line-height": String(design.lineHeight),
    "--book-paragraph-indent": design.preset.indentParagraphs ? "1.5em" : "0",
    "--book-paragraph-gap": design.preset.indentParagraphs ? "0" : "1em",
  };
}
