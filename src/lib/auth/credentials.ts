/**
 * Cleaning up credentials before they are sent.
 *
 * Password managers, PDFs and rich-text fields routinely smuggle invisible
 * characters into a copied password — a byte-order mark, a zero-width space, a
 * soft hyphen. They are impossible to see, impossible to retype, and at least
 * one of them breaks the request outright:
 *
 *   Cannot convert argument to a ByteString because the character at index 7
 *   has a value of 65279 which is greater than 255
 *
 * 65279 is U+FEFF. So we strip the invisibles rather than letting somebody be
 * locked out by a character they cannot see. Stripping happens identically on
 * sign-up, sign-in and password change, so a password set through one route
 * always matches the same typing through another.
 *
 * Note what is *not* stripped: ordinary spaces inside a password, accented
 * letters, emoji and non-Latin scripts are all left alone. Only characters with
 * no visual representation are removed.
 *
 * The check is written against code points rather than as a regular expression
 * literal, because a literal would contain the very characters it removes —
 * invisible in every editor and impossible to review.
 */

function isInvisible(codePoint: number): boolean {
  return (
    // C0 controls and DEL
    codePoint <= 0x1f ||
    codePoint === 0x7f ||
    // C1 controls
    (codePoint >= 0x80 && codePoint <= 0x9f) ||
    // Soft hyphen
    codePoint === 0x00ad ||
    // Zero-width space / non-joiner / joiner, and the bidi marks
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    // Bidi embedding and override controls
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    // Word joiner, invisible operators
    (codePoint >= 0x2060 && codePoint <= 0x2064) ||
    // Bidi isolate controls and deprecated formatting
    (codePoint >= 0x206a && codePoint <= 0x206f) ||
    // Byte-order mark / zero-width no-break space — the one that breaks fetch
    codePoint === 0xfeff
  );
}

export function sanitizePassword(value: string): string {
  let result = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || isInvisible(codePoint)) continue;
    result += character;
  }
  return result;
}

export function sanitizeEmail(value: string): string {
  // An address is case-insensitive, and a trailing space is never intended.
  return sanitizePassword(value).trim().toLowerCase();
}

/** True when the raw input contained something invisible that we removed. */
export function hadInvisibleCharacters(value: string): boolean {
  return sanitizePassword(value) !== value;
}
