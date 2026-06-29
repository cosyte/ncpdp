/**
 * NCPDP Telecommunication-standard monetary value decoding.
 *
 * Dollar-amount fields in the Telecom response segments (Patient Pay Amount,
 * Total Amount Paid, Ingredient Cost Paid, …) are unsigned/signed integer digit
 * strings with an **implied 2-place decimal** (cents): `"0001000"` means `10.00`.
 * A negative amount is carried by the NCPDP **zoned-decimal overpunch** sign on
 * the final character (the COBOL/EBCDIC convention NCPDP inherits): `"000100{"`
 * is `+10.00`, `"000100}"` is `-10.00`.
 *
 * Money is **never** parsed into a JS `number` — binary floating point would
 * silently corrupt a value a real claim is paid against. The verbatim
 * {@link TelecomMoney.source} is always authoritative; the interpreted
 * {@link TelecomMoney.amount} is a string-wise convenience and is only present
 * when the value matches the expected shape. Anything unexpected is preserved
 * with `isValid: false` and no `amount` — the library never guesses or recomputes.
 */

/** Implied decimal places for an NCPDP dollar amount (cents). */
const MONEY_DECIMALS = 2;

/**
 * Zoned-decimal overpunch: the final character of a signed numeric field encodes
 * both its last digit and the sign. Positive `{`,A–I → 0–9; negative `}`,J–R →
 * 0–9. This is the standard EBCDIC-derived convention; the table is a data-format
 * fact, not NCPDP prose.
 */
const OVERPUNCH: ReadonlyMap<string, { readonly digit: string; readonly negative: boolean }> =
  new Map([
    ["{", { digit: "0", negative: false }],
    ["A", { digit: "1", negative: false }],
    ["B", { digit: "2", negative: false }],
    ["C", { digit: "3", negative: false }],
    ["D", { digit: "4", negative: false }],
    ["E", { digit: "5", negative: false }],
    ["F", { digit: "6", negative: false }],
    ["G", { digit: "7", negative: false }],
    ["H", { digit: "8", negative: false }],
    ["I", { digit: "9", negative: false }],
    ["}", { digit: "0", negative: true }],
    ["J", { digit: "1", negative: true }],
    ["K", { digit: "2", negative: true }],
    ["L", { digit: "3", negative: true }],
    ["M", { digit: "4", negative: true }],
    ["N", { digit: "5", negative: true }],
    ["O", { digit: "6", negative: true }],
    ["P", { digit: "7", negative: true }],
    ["Q", { digit: "8", negative: true }],
    ["R", { digit: "9", negative: true }],
  ]);

/**
 * A monetary amount from a Telecom response, preserved exactly as it appeared on
 * the wire. The verbatim {@link source} is authoritative; {@link amount} is a
 * best-effort string-wise interpretation present only when {@link isValid}.
 */
export interface TelecomMoney {
  /** The amount exactly as it appeared on the wire, verbatim. */
  readonly source: string;
  /** True when {@link source} decodes to a signed implied-2-decimal amount. */
  readonly isValid: boolean;
  /** The signed decimal string (e.g. `"10.00"`, `"-3.50"`), present when valid. */
  readonly amount?: string;
  /** True when the decoded amount is negative (overpunch or leading `-`). */
  readonly isNegative?: boolean;
}

const DIGITS_RE = /^\d+$/;

/** Apply an implied N-place decimal to a non-empty digit string, string-wise. */
function applyImpliedDecimal(digits: string, places: number): string {
  const padded = digits.padStart(places + 1, "0");
  const whole = padded.slice(0, -places).replace(/^0+(?=\d)/, "");
  return `${whole}.${padded.slice(-places)}`;
}

/**
 * Resolve a raw money field into `{ digits, negative }`, or `undefined` when the
 * value does not match a recognized signed-numeric shape. Recognizes a plain
 * digit run, a leading `+`/`-` sign, and an NCPDP trailing overpunch sign.
 */
function resolveSign(
  raw: string,
): { readonly digits: string; readonly negative: boolean } | undefined {
  if (raw.length === 0) return undefined;

  if (DIGITS_RE.test(raw)) return { digits: raw, negative: false };

  const first = raw[0];
  if ((first === "+" || first === "-") && DIGITS_RE.test(raw.slice(1)) && raw.length > 1) {
    return { digits: raw.slice(1), negative: first === "-" };
  }

  const last = raw[raw.length - 1] ?? "";
  const punch = OVERPUNCH.get(last);
  const lead = raw.slice(0, -1);
  if (punch !== undefined && (lead === "" || DIGITS_RE.test(lead))) {
    return { digits: lead + punch.digit, negative: punch.negative };
  }

  return undefined;
}

/**
 * Decode an NCPDP Telecom dollar-amount field into a {@link TelecomMoney}. Never
 * uses floating point: the verbatim source is preserved and the implied 2-place
 * decimal is applied string-wise. Unrecognized input is preserved with
 * `isValid: false` and no interpreted amount — money is never guessed.
 *
 * @param source - The amount exactly as it appeared on the wire.
 * @returns A frozen {@link TelecomMoney}.
 *
 * @example
 * ```ts
 * telecomMoney("0001000").amount; // "10.00"
 * telecomMoney("000350}").amount; // "-3.50" (negative overpunch)
 * telecomMoney("N/A").isValid;    // false (preserved verbatim)
 * ```
 */
export function telecomMoney(source: string): TelecomMoney {
  const resolved = resolveSign(source);
  if (resolved === undefined) {
    return Object.freeze({ source, isValid: false });
  }
  const magnitude = applyImpliedDecimal(resolved.digits, MONEY_DECIMALS);
  const amount = resolved.negative && magnitude !== "0.00" ? `-${magnitude}` : magnitude;
  return Object.freeze({
    source,
    isValid: true,
    amount,
    isNegative: resolved.negative && magnitude !== "0.00",
  });
}
