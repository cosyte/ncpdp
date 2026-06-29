/**
 * A decimal value preserved exactly as it appeared on the wire.
 *
 * NCPDP quantities, strengths, and days-supply are decimal quantities where
 * binary floating point would silently corrupt the value (e.g. `0.1`). We never
 * parse them into a JS `number`; we keep the original source string and a
 * validity flag, leaving any arithmetic to the consumer who can choose a
 * decimal-safe representation.
 */
export interface DecimalValue {
  /** The original textual value, verbatim. */
  readonly source: string;
  /** True when {@link source} matches a plain decimal numeric literal. */
  readonly isValid: boolean;
}

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/**
 * Wrap a raw textual value as a {@link DecimalValue} without converting to a
 * float. Invalid input is preserved as-is with `isValid: false` — lenient parse,
 * never a throw.
 *
 * @param raw - The textual value from the message (already trimmed by the caller).
 * @returns A frozen {@link DecimalValue}.
 *
 * @example
 * ```ts
 * decimalValue("0.1").isValid;   // true
 * decimalValue("1/2").isValid;   // false (still preserved as source)
 * ```
 */
export function decimalValue(raw: string): DecimalValue {
  return Object.freeze({ source: raw, isValid: DECIMAL_RE.test(raw) });
}
