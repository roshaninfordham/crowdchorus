// Control and format characters (incl. bidi overrides, zero-width chars).
const CONTROL = /[\p{Cc}\p{Cf}]/gu;

/** Trim, collapse whitespace, strip control chars, cap at `max` code points. */
export function cleanText(input: string, max: number): string {
  const s = input.normalize("NFC").replace(/\s+/g, " ").replace(CONTROL, "").trim();
  return Array.from(s).slice(0, max).join("").trim();
}
