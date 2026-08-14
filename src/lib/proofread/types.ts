/**
 * Proofreading, designed around preservation.
 *
 * The product rule this file exists to encode:
 *
 *   "I love you sooo much askim"
 *
 * must never quietly become
 *
 *   "I love you very much, my darling."
 *
 * The first is what somebody actually wrote to someone they love. Correcting it
 * into standard English deletes the person. So the machine is only ever allowed
 * to fix what is unambiguously a mistake — and even then, a human presses
 * Accept.
 */

export type ProofreadMode = "gentle" | "polish";

export type ParagraphCorrection = {
  /** Position of the block in the entry, as produced by `toPlainText`. */
  index: number;
  /** The paragraph exactly as written. Used to locate it safely. */
  original: string;
  corrected: string;
  /** Short, plain-language reasons: "recieve → receive", "missing full stop". */
  notes: string[];
};

export type ProofreadResult = {
  mode: ProofreadMode;
  corrections: ParagraphCorrection[];
  /** Set when the provider ran but declined to change anything. */
  unchanged: boolean;
};

export type ProofreadRequest = {
  paragraphs: string[];
  mode: ProofreadMode;
};

/**
 * The provider boundary.
 *
 * Everything above this line is product logic; everything below is one vendor.
 * Swapping providers, or adding a local/offline one later, means writing one
 * more implementation of this and changing nothing else.
 */
export interface ProofreadProvider {
  readonly name: string;
  proofread(request: ProofreadRequest): Promise<ProofreadResult>;
}

export class ProofreadUnavailableError extends Error {
  constructor(message = "Proofreading is not configured.") {
    super(message);
    this.name = "ProofreadUnavailableError";
  }
}
