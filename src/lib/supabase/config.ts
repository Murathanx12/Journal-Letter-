/**
 * Supabase connection details, cleaned before use.
 *
 * These end up in HTTP headers — the key becomes `Authorization: Bearer <key>`
 * — and a header value may only contain characters below 256. A single
 * invisible character therefore does not degrade anything gracefully: `fetch`
 * refuses to send the request at all, with
 *
 *   Cannot convert argument to a ByteString because the character at index 7
 *   has a value of 65279 which is greater than 255
 *
 * Index 7 is the first character after "Bearer ", i.e. the start of the key.
 *
 * A byte-order mark is astonishingly easy to introduce into configuration: many
 * editors write UTF-8 with a BOM by default, and on Windows piping a value into
 * a CLI adds one. Since the failure is total and the cause is invisible in every
 * dashboard, the values are stripped here rather than trusted.
 */

function clean(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in, or set it in your hosting provider.`,
    );
  }

  // Strip the BOM and any zero-width characters anywhere in the value, then
  // trim ordinary whitespace and stray surrounding quotes.
  const stripped = [...value]
    .filter((character) => {
      const code = character.codePointAt(0)!;
      return code !== 0xfeff && !(code >= 0x200b && code <= 0x200f) && code !== 0x2060;
    })
    .join("")
    .trim()
    .replace(/^["']|["']$/g, "");

  return stripped;
}

export function supabaseUrl(): string {
  return clean(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
}

export function supabaseKey(): string {
  return clean(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
}
