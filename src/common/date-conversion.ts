import { daysInMonth, type DateValue } from "./date.js";

/**
 * The calendar components a parsed value actually stated, and nothing else.
 *
 * ONLY STATED COMPONENTS ARE PRESENT. A component the value did not state is
 * absent: the key is not there at all, rather than there holding `undefined`.
 * `Object.keys()` of the result is therefore exactly the set of stated
 * components and the value's precision is recoverable from it. There is no
 * `precision` key, no `source` key and no `isValid` key.
 *
 * This shape is shared verbatim with the sibling `@cosyte/*` parsers, so all
 * eight components are declared here even though this package can populate only
 * three of them. The one wire form decoded is `CCYYMMDD`, a whole calendar day,
 * so `year`, `month` and `day` are always present together and `hour`,
 * `minute`, `second`, `millisecond` and `offsetMinutes` are never present at
 * all. They are declared so that a consumer moving between two `@cosyte/*`
 * parsers reads one declaration rather than two.
 *
 * Deleting `offsetMinutes` leaves an object that `Temporal.PlainDate.from` and
 * luxon's `DateTime.fromObject` accept with no key rename and no value
 * adjustment: `month` is spec-native 1 to 12 and the names are singular. That
 * compatibility is the reason for the shape. Neither library is a dependency of
 * this package and neither is imported here.
 */
export interface DateParts {
  /** Four-digit calendar year, as stated (`0050` is year 50, never 1950). */
  readonly year?: number;
  /** Calendar month, 1 to 12: spec-native, never the JS `Date` 0 to 11. */
  readonly month?: number;
  /** Calendar day of month. */
  readonly day?: number;
  /** Hour of day, 0 to 23. Never populated by this package. */
  readonly hour?: number;
  /** Minute of hour, 0 to 59. Never populated by this package. */
  readonly minute?: number;
  /** Second of minute, 0 to 59. Never populated by this package. */
  readonly second?: number;
  /** Millisecond, 0 to 999. Never populated by this package. */
  readonly millisecond?: number;
  /** Signed minutes east of UTC. Never populated by this package. */
  readonly offsetMinutes?: number;
}

/** The one option {@link toDate} takes, and the only key it carries. */
export interface ToDateOptions {
  /**
   * The UTC offset, in signed minutes east of UTC, to assume for a value that
   * states none. An explicit `0` means "treat this naive value as UTC". With no
   * value here there is no determinate zone and {@link toDate} answers
   * `undefined`.
   */
  readonly assumeOffsetMinutes?: number;
}

/**
 * The components a value states, re-checked AGAINST THE CALENDAR before
 * anything is built from them.
 *
 * The COMPONENTS are authoritative, not `source`: they are the decode, and
 * `source` is the record of what the wire said. {@link DateValue} is an
 * exported interface, so a hand-built or spread-modified value is a shape a
 * consumer can hold, and it arrives here without having passed
 * {@link "./date".dateValue} at all. So THE SAME CALENDAR RULE THE DECODER
 * APPLIES IS APPLIED AGAIN HERE, by the same call: a four-digit year, a month
 * of 1 to 12, and a day the month actually has in that year, by the full
 * 4/100/400 leap rule of {@link "./date".daysInMonth}. A value carrying no
 * components at all answers `undefined` rather than reaching arithmetic.
 *
 * Bounding the day by 31 is NOT enough, and the gap is quiet rather than loud.
 * `{ year: 2024, month: 2, day: 30 }` is not a day; left unchecked it renders
 * `"2024-02-30"`, which every ISO-8601 reader silently moves
 * (`new Date("2024-02-30T00:00:00Z")` is 1 March), and `toDate` rolls it into
 * the following month. Date of Birth (304-C4) and Date of Service (401-D1) are
 * the two fields this package decodes, so that is a date of birth a day later
 * than the one that was written, with nothing thrown and nothing warned. An
 * out-of-range component is refused here, never rolled over.
 */
function stated(
  value: DateValue | null | undefined,
): { readonly year: number; readonly month: number; readonly day: number } | undefined {
  if (value === undefined || value === null) return undefined;
  const { year, month, day } = value;
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return undefined;
  }
  // `DateValue.year` is declared four-digit and `toISO` pads to four digits, so
  // a year outside 0000 to 9999 is a year this value type cannot state and a
  // rendering no ISO-8601 reader reads back.
  if (year < 0 || year > 9999) return undefined;
  if (month < 1 || month > 12) return undefined;
  if (day < 1 || day > daysInMonth(year, month)) return undefined;
  return { year, month, day };
}

/** Zero-pad a non-negative integer to `width` digits. */
function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/**
 * Read the calendar components a parsed date stated, as a frozen plain object.
 *
 * Returns `undefined` for `undefined`, for `null`, for a value stating no
 * usable components at all, and for a value whose components do not name a real
 * calendar day (February 30, month 13, day 0). Never throws, for any input.
 *
 * @param value - A parsed date from {@link "./date".dateValue}.
 * @returns The stated components, or `undefined`.
 *
 * @example
 * ```ts
 * toObject(dateValue("19880705")); // { year: 1988, month: 7, day: 5 }
 * toObject(undefined);             // undefined
 * // A hand-built value is bound by the same calendar rule as a wire string:
 * toObject({ source: "20240230", year: 2024, month: 2, day: 30 }); // undefined
 * ```
 */
export function toObject(value: DateValue | null | undefined): DateParts | undefined {
  const parts = stated(value);
  if (parts === undefined) return undefined;
  return Object.freeze({ year: parts.year, month: parts.month, day: parts.day });
}

/**
 * Render a parsed date as ISO-8601, truncated to the precision it stated.
 *
 * The one decoded wire form is a whole calendar day, so the rendering is always
 * `YYYY-MM-DD` and NOTHING is appended: the value carries no UTC offset, so no
 * `Z` is fabricated and the string is deliberately zone-less. A year below 1000
 * is zero-padded to four digits and stays the year it is.
 *
 * Returns `undefined` for `undefined`, for `null`, for a value stating no
 * usable components at all, and for a value whose components do not name a real
 * calendar day: the string this returns always names a day that exists, so it
 * reads back as itself rather than being silently moved. Never throws, for any
 * input.
 *
 * @param value - A parsed date from {@link "./date".dateValue}.
 * @returns The ISO-8601 rendering, or `undefined`.
 *
 * @example
 * ```ts
 * toISO(dateValue("19880705")); // "1988-07-05"
 * toISO(dateValue("00500101")); // "0050-01-01"
 * // Never "2024-02-30", which every ISO-8601 reader reads back as 1 March:
 * toISO({ source: "20240230", year: 2024, month: 2, day: 30 }); // undefined
 * ```
 */
export function toISO(value: DateValue | null | undefined): string | undefined {
  const parts = stated(value);
  if (parts === undefined) return undefined;
  return `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`;
}

/**
 * Turn a parsed date into an absolute instant, ONLY when the caller supplies the
 * zone.
 *
 * No wire form this package decodes carries a UTC offset, so the zone is never
 * determinate on its own: with no `assumeOffsetMinutes` the answer is
 * `undefined`. The host machine's timezone is never read and UTC is never
 * assumed. That is the point of the refusal rather than a limitation of it: a
 * date of birth resolved to a guessed zone is a day out in every
 * negative-offset zone, and nothing throws to say so.
 *
 * The value's own precision is unchanged by the call. The time of day is filled
 * to midnight for instant construction only, and a later {@link toObject} or
 * {@link toISO} on the same value answers exactly what it answered before.
 *
 * Returns `undefined` for `undefined`, for `null`, for a value stating no usable
 * components, for a value whose components do not name a real calendar day, for
 * a non-finite offset, and for an offset that pushes the instant outside the
 * range a `Date` can represent. Never throws, for any input, and never rolls an
 * impossible day over into the following month. Never an `Invalid Date` either:
 * a partial answer wearing the shape of an instant is the one shape a caller
 * cannot tell from a real one.
 *
 * @param value - A parsed date from {@link "./date".dateValue}.
 * @param options - The zone to assume; see {@link ToDateOptions}.
 * @returns The instant, or `undefined` when no determinate zone was supplied.
 *
 * @example
 * ```ts
 * toDate(dateValue("19880705"));                            // undefined: no zone
 * toDate(dateValue("19880705"), { assumeOffsetMinutes: 0 }); // 1988-07-05T00:00:00.000Z
 * ```
 */
export function toDate(
  value: DateValue | null | undefined,
  options?: ToDateOptions,
): Date | undefined {
  const parts = stated(value);
  if (parts === undefined) return undefined;

  // The ONLY zone input. There is deliberately no `parts.offsetMinutes ?? ...`
  // fallback: no decoded form states an offset, so that branch would be
  // unreachable code implying this package can carry one.
  const assumed = options?.assumeOffsetMinutes;
  if (assumed === undefined) return undefined;
  if (!Number.isFinite(assumed)) return undefined;

  const instant = new Date(0);
  // setUTCFullYear, never Date.UTC and never the Date constructor: those two
  // remap a year below 100 into the 1900s, which would age a patient by exactly
  // 1900 years and throw no error doing it.
  instant.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  instant.setUTCHours(0, 0, 0, 0);
  instant.setTime(instant.getTime() - assumed * 60_000);
  if (Number.isNaN(instant.getTime())) return undefined;
  return instant;
}
