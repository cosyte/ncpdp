/**
 * A calendar date decoded from an NCPDP wire value, preserving the wire string
 * exactly beside the components it stated.
 *
 * ONE WIRE FORM IS DECODED, AND THAT IS DELIBERATE: `CCYYMMDD`, a fixed run of
 * eight digits naming one whole calendar day. It is the only date form this
 * package declares anywhere, on Date of Service (401-D1) in the Transaction
 * Header and on Date of Birth (304-C4) in the Patient segment. Every other
 * date-bearing or time-bearing field this package surfaces is carried verbatim
 * with no form stated for it: the SCRIPT `<SentTime>`, `<DateOfBirth>` and
 * `<WrittenDate>` values, and the Telecom Other Payer Date (443-E8) and
 * Previous Date Of Fill (530-FU) values. Those are UNDECODED here rather than
 * guessed, because the documents that would settle their form are purchased
 * products this package cannot cite, and a date decoded from an unread
 * specification is the quiet wrong answer this whole surface exists to refuse.
 *
 * The parsed structures are untouched by any of this. `header.dateOfService`,
 * `claim.dateOfBirth`, `patient.dateOfBirth` and every other date field are
 * still the verbatim strings they have always been; decoding one is opt-in.
 */
export interface DateValue {
  /** The date exactly as it appeared on the wire. */
  readonly source: string;
  /** Four-digit calendar year, as stated (`0050` is year 50, never 1950). */
  readonly year: number;
  /** Calendar month, 1 to 12: spec-native, never the JS `Date` 0 to 11. */
  readonly month: number;
  /** Calendar day of month, 1 to the length of {@link month} in {@link year}. */
  readonly day: number;
}

/** The one decoded wire form: eight digits, `CCYYMMDD`. */
const CCYYMMDD = /^\d{8}$/;

/** True for a Gregorian leap year, by the full 4/100/400 rule. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Length of a month, written as tests on the month number rather than as a
 * table lookup: an indexed table under `noUncheckedIndexedAccess` needs a
 * fallback arm that no input can reach, and an unreachable arm in calendar
 * arithmetic is exactly the kind of code that later gets "fixed" wrongly.
 */
function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/**
 * Decode a verbatim NCPDP date string into a {@link DateValue}, or `undefined`
 * when it is not a value this package decodes.
 *
 * Never throws, for any input, and never returns a half-filled value: a string
 * that is not exactly eight digits, or that names a day the calendar does not
 * have (February 30, month 13, day 0), is `undefined` rather than a value with
 * some components set. `undefined` and `null` are `undefined` too, so a caller
 * can hand it an optional field straight off a parsed model.
 *
 * Returning `undefined` loses nothing. Unlike {@link "./decimal".decimalValue}
 * and its siblings, this wrapper never replaces a field on a parsed structure:
 * the wire string stays on the model whatever this answers, so there is no
 * source for the caller to lose.
 *
 * @param raw - The date value exactly as it appeared on the wire.
 * @returns A frozen {@link DateValue}, or `undefined` when the string does not
 *   match a decoded form.
 *
 * @example
 * ```ts
 * dateValue("19880705")?.month; // 7: spec-native, never 6
 * dateValue("19880732");        // undefined: no such day, nothing partial
 * dateValue("1988-07-05");      // undefined: not a form this package declares
 * ```
 */
export function dateValue(raw: string | null | undefined): DateValue | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!CCYYMMDD.test(raw)) return undefined;

  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));

  if (month < 1 || month > 12) return undefined;
  if (day < 1 || day > daysInMonth(year, month)) return undefined;

  return Object.freeze({ source: raw, year, month, day });
}
