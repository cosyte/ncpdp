import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  claim,
  dateValue,
  newRx,
  parseScript,
  parseTelecom,
  toDate,
  toISO,
  toObject,
  type DateParts,
  type DateValue,
} from "../src/index.js";
import {
  dateValue as commonDateValue,
  toDate as commonToDate,
  toISO as commonToISO,
  toObject as commonToObject,
} from "../src/common/index.js";
import { buildTransmission } from "./_helpers/build-telecom.js";

/**
 * THE SHARED CONVERSION SURFACE, AND THE ONE THING THAT BOUNDS IT HERE.
 *
 * `toObject`, `toISO` and `toDate` carry the same names, the same return shapes and the same
 * timezone rule in every `@cosyte/*` parser, so moving between two of them costs nothing to
 * relearn. What differs per package is which WIRE FORMS the package can decode into the value the
 * three functions read, and for this package that set is exactly one: `CCYYMMDD`.
 *
 * THAT IS NOT A SHORTCUT, IT IS THE WHOLE CONSTRAINT. The NCPDP Implementation Guides and the
 * External Code List are purchased products this repository cannot cite, so the only wire forms
 * that may be decoded here are the ones this repository itself declares. It declares exactly one,
 * twice: Date of Service (401-D1) in `src/telecom/header.ts` ("verbatim (`CCYYMMDD` on the wire)")
 * and Date of Birth (304-C4) in `src/telecom/claim.ts` ("verbatim (`CCYYMMDD`)"). Every other
 * date-bearing or time-bearing field it surfaces is documented as verbatim with NO form stated:
 * the SCRIPT `<SentTime>`, `<DateOfBirth>` and `<WrittenDate>` values, and the Telecom Other Payer
 * Date (443-E8) and Previous Date Of Fill (530-FU) values. Those are undecoded rather than guessed.
 *
 * WHICH ROWS OF THE SHARED CASE TABLE ARE LIVE FOLLOWS FROM THAT, AND FROM NOTHING ELSE.
 * `CCYYMMDD` is a fixed eight digits naming one whole calendar day: no year-only form, no time of
 * day, no fractional second, no UTC offset. So R1, R5, R6, R7 and R10 are skipped, each with the
 * reason written above it, and each backed by a LIVE measurement in "the properties behind the
 * skipped rows" so the reason rests on something this suite checks rather than on a comment.
 * R2, R3, R4, R8, R9 and R11 are live.
 */

const ROOT = join(import.meta.dirname, "..");

/** Strip comments so a source scan reads the CODE and not the prose about the code. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function readSource(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/**
 * A `DateValue` stating no components at all.
 *
 * Every component of `DateValue` is required, so TypeScript cannot express this shape and a
 * caller writing TypeScript cannot reach it. A JavaScript consumer can, and so can anything that
 * hands these functions a value it deserialised, so the shape is built the way it would really
 * arrive: through a boundary that erases the type. The shared rules require it to answer
 * `undefined` rather than throw, which is what makes it worth asserting rather than assuming.
 */
function valueMissingEveryComponent(): DateValue {
  return JSON.parse("{}") as DateValue;
}

/** A value the three functions must refuse, asserted through all three at once. */
function expectAllThreeUndefined(value: DateValue | null | undefined): void {
  expect(() => toObject(value)).not.toThrow();
  expect(() => toISO(value)).not.toThrow();
  expect(() => toDate(value)).not.toThrow();
  expect(() => toDate(value, { assumeOffsetMinutes: 0 })).not.toThrow();
  expect(toObject(value)).toBeUndefined();
  expect(toISO(value)).toBeUndefined();
  expect(toDate(value)).toBeUndefined();
  expect(toDate(value, { assumeOffsetMinutes: 0 })).toBeUndefined();
}

/** A Telecom B1 transmission carrying a Date of Service and a Date of Birth. */
function telecomClaimWithDates(): string {
  return buildTransmission({ transactionCode: "B1", dateOfService: "20260629" }, [
    [
      { id: "01", fields: [["C4", "19850722"]] },
      { id: "07", fields: [["D2", "RX0000001"]] },
    ],
  ]);
}

/** A SCRIPT NewRx carrying the three date-bearing SCRIPT elements. */
const SCRIPT_NEWRX = `<Message version="2017071">
  <Header><MessageID>SYNTH-MSG-0001</MessageID><SentTime>2026-01-15T09:30:00Z</SentTime></Header>
  <Body><NewRx>
    <Patient><HumanPatient>
      <Name><LastName>DOE</LastName></Name>
      <DateOfBirth><Date>1990-04-12</Date></DateOfBirth>
    </HumanPatient></Patient>
    <MedicationPrescribed>
      <DrugDescription>Amoxicillin 500 MG Oral Capsule</DrugDescription>
      <WrittenDate><Date>2026-01-15</Date></WrittenDate>
    </MedicationPrescribed>
  </NewRx></Body>
</Message>`;

describe("the three names resolve, from the root and from the value's own subpath", () => {
  it("exports toObject, toISO and toDate under exactly those names", () => {
    expect(typeof toObject).toBe("function");
    expect(typeof toISO).toBe("function");
    expect(typeof toDate).toBe("function");
    expect(typeof dateValue).toBe("function");
  });

  it("resolves the same three functions from @cosyte/ncpdp and from @cosyte/ncpdp/common", () => {
    // `DateValue` is a shared value wrapper, so it lives beside `decimalValue`, `ndcValue` and
    // `codedValue` in `common` and is re-exported by the root, exactly as they are. Neither
    // `/script` nor `/telecom` re-exports any common wrapper, and this surface does not become
    // the first: the SAME function object answers a SCRIPT value and a Telecom value.
    expect(toObject).toBe(commonToObject);
    expect(toISO).toBe(commonToISO);
    expect(toDate).toBe(commonToDate);
    expect(dateValue).toBe(commonDateValue);
  });

  it("gives toDate an optional second argument carrying assumeOffsetMinutes and no other key", () => {
    const v = dateValue("19880705");
    expect(toDate(v)).toBeUndefined();
    expect(toDate(v, {})).toBeUndefined();
    expect(toDate(v, { assumeOffsetMinutes: 0 })?.toISOString()).toBe("1988-07-05T00:00:00.000Z");
    // Compile-time, verified by `tsc --noEmit`: any other key is refused outright.
    // @ts-expect-error `ToDateOptions` carries assumeOffsetMinutes and nothing else.
    expect(toDate(v, { assumeOffsetMinutes: 0, timeZone: "UTC" })).toBeInstanceOf(Date);
  });
});

describe("the enumerated wire forms, and the ones this package refuses to guess", () => {
  it("decodes CCYYMMDD, the one date form this repository declares", () => {
    expect(toObject(dateValue("20260629"))).toStrictEqual({ year: 2026, month: 6, day: 29 });
    expect(toObject(dateValue("19850722"))).toStrictEqual({ year: 1985, month: 7, day: 22 });
    expect(toISO(dateValue("20260629"))).toBe("2026-06-29");
  });

  it("refuses every form the repository states nowhere, rather than guessing one", () => {
    // These are the shapes the SCRIPT fixtures happen to carry and the shapes an adjacent
    // standard uses. NOT ONE OF THEM IS DECLARED as the wire form of any field in this
    // repository, in a type, a doc comment or a code list, so each answers `undefined` here.
    // A fixture is an instance of what one sender wrote; it is not a statement of the form.
    for (const raw of [
      "2026-06-29",
      "2026-01-15T09:30:00Z",
      "20260629T093000",
      "202606290930",
      "20260629093000",
      "20260629093000.5",
      "2026-06-29T09:30:00-05:00",
      "202606",
      "2026",
      "06/29/2026",
      "290620 26",
    ]) {
      expect(dateValue(raw), raw).toBeUndefined();
      expectAllThreeUndefined(dateValue(raw));
    }
  });

  it("declares CCYYMMDD in the source, and no second form beside it", () => {
    // The module's own code, comments stripped: the ONLY literal wire-form pattern in it is the
    // eight-digit run. A second pattern appearing here is a second decoded form, and it would
    // have to come from somewhere, which is the thing this slice may not do.
    const code = codeOnly(readSource("src/common/date.ts"));
    const literals = code.match(/\/\^[^/]*\/[a-z]*/g) ?? [];
    expect(literals).toStrictEqual(["/^\\d{8}$/"]);
  });
});

describe("shared case table", () => {
  /*
   * REASON THIS ROW IS SKIPPED. R1 wants a value stated to the YEAR. The enumeration recorded
   * exactly one decoded wire form, `CCYYMMDD`, which is a fixed eight digits: century, year,
   * month and day, all four always present together. There is no year-only or month-only form
   * among the forms this repository declares, and the fields whose form it declares nowhere
   * (SCRIPT `<SentTime>` / `<DateOfBirth>` / `<WrittenDate>`, Telecom 443-E8 and 530-FU) are
   * undecoded rather than guessed, so none of them supplies one either. Measured live in "the
   * properties behind the skipped rows".
   */
  it.skip("R1 a year-precision value: the one decoded form, CCYYMMDD, always states the day too");

  it("R2 a day-precision value with no offset: keys, no trailing Z, and no instant", () => {
    const v = dateValue("20260629");
    const parts = toObject(v);
    expect(Object.keys(parts ?? {})).toStrictEqual(["year", "month", "day"]);
    expect(parts).toStrictEqual({ year: 2026, month: 6, day: 29 });
    expect(toISO(v)).toBe("2026-06-29");
    expect(toISO(v)?.endsWith("Z")).toBe(false);
    expect(toDate(v)).toBeUndefined();
  });

  it("R3 the same value with assumeOffsetMinutes 0 is the UTC midnight instant", () => {
    const d = toDate(dateValue("20260629"), { assumeOffsetMinutes: 0 });
    expect(d?.toISOString()).toBe("2026-06-29T00:00:00.000Z");
    // Asserted as an epoch integer too, so the case cannot pass by host-zone accident.
    expect(d?.getTime()).toBe(Date.parse("2026-06-29T00:00:00.000Z"));
  });

  it("R4 the same value with assumeOffsetMinutes -300 is 05:00Z that day", () => {
    const d = toDate(dateValue("20260629"), { assumeOffsetMinutes: -300 });
    expect(d?.toISOString()).toBe("2026-06-29T05:00:00.000Z");
  });

  /*
   * REASON THIS ROW IS SKIPPED. R5 wants a second-precision value carrying an explicit non-zero
   * UTC offset. NO DATE FORM THIS PACKAGE DECODES CARRIES A TIME OF DAY OR A TIMEZONE OFFSET: the
   * enumerated set is the single form `CCYYMMDD`, eight digits of calendar date with no time
   * component and no offset component. The one field whose verbatim values do carry a time,
   * SCRIPT `<SentTime>`, declares no form anywhere in this repository, so it is undecoded and
   * cannot supply the row either. Measured live in "the properties behind the skipped rows".
   */
  it.skip("R5 a second-precision value with an explicit non-zero offset: CCYYMMDD carries neither");

  /*
   * REASON THIS ROW IS SKIPPED. R6 wants a value carrying an explicit ZERO offset, so that
   * `offsetMinutes` is present as 0 and `toISO` ends in Z. Same property as R5: the enumerated
   * form `CCYYMMDD` states no offset at all, zero or otherwise, so there is no value of it that
   * can distinguish a stated zero offset from an absent one. Measured live below.
   */
  it.skip("R6 a value with an explicit ZERO offset: the one decoded form states no offset at all");

  /*
   * REASON THIS ROW IS SKIPPED. R7 wants stated fractional seconds. `CCYYMMDD` has no seconds
   * component, so it can have no fraction of one. The enumeration records no other decoded form,
   * and the undecoded fields are undecoded precisely because this repository states no form for
   * them. Measured live below.
   */
  it.skip(
    "R7 a value with stated fractional seconds: CCYYMMDD has no seconds to take a fraction of",
  );

  it("R8 every distinct route to a value this package will not decode answers undefined", () => {
    // The constructor returns `undefined` rather than an invalid-but-present value, so this row
    // is expressed as that `undefined` reached by each distinct route, plus the second shape a
    // caller can still reach: a hand-built object stating no components at all.
    const notDecoded = [
      "19880732", // calendar-invalid: July has 31 days
      "20260230", // calendar-invalid: February 30, in a leap year
      "20250229", // calendar-invalid: February 29, in a common year
      "19880631", // calendar-invalid: June has 30 days
      "19881301", // month out of range
      "19880001", // month zero
      "19880700", // day zero
      "1988070", // seven digits
      "198807051", // nine digits
      "1988-07-05", // punctuated
      "1988070a", // a letter where the form requires a digit
      " 19880705", // leading space
      "19880705 ", // trailing space
      "", // the empty string
    ];
    for (const raw of notDecoded) {
      expect(dateValue(raw), raw).toBeUndefined();
      expectAllThreeUndefined(dateValue(raw));
    }
    // The leap rule is a rule, not a table: the century cases go both ways.
    expect(dateValue("20000229")?.day).toBe(29);
    expect(dateValue("19000229")).toBeUndefined();

    expectAllThreeUndefined(valueMissingEveryComponent());
  });

  it("R9 undefined and null answer undefined from all three, and nothing throws", () => {
    expectAllThreeUndefined(undefined);
    expectAllThreeUndefined(null);
    expect(dateValue(undefined)).toBeUndefined();
    expect(dateValue(null)).toBeUndefined();
    expect(() => dateValue(undefined)).not.toThrow();
    expect(() => dateValue(null)).not.toThrow();
  });

  /*
   * REASON THIS ROW IS SKIPPED. R10 wants a time-only value: no year, month or day, a bare time
   * rendering, and no instant. The one decoded form, `CCYYMMDD`, opens with a mandatory four-digit
   * year and carries no time component at all, so no value of it is time-only and no value of it
   * can be. The fields that do carry a time on the wire declare no form here and are undecoded.
   * Measured live in "the properties behind the skipped rows".
   */
  it.skip("R10 a time-only value: CCYYMMDD opens with a mandatory year and states no time");

  it("R11 year 0050 at day precision, with a determinate zone, reports year 50", () => {
    const d = toDate(dateValue("00500101"), { assumeOffsetMinutes: 0 });
    expect(d?.getUTCFullYear()).toBe(50);
    expect(toISO(dateValue("00500101"))).toBe("0050-01-01");
    expect(toObject(dateValue("00500101"))).toStrictEqual({ year: 50, month: 1, day: 1 });
    // The two routes this implementation deliberately does not take BOTH answer 1950, which is
    // why the guard is worth having: measured here rather than described in a comment.
    expect(new Date(Date.UTC(50, 0, 1)).getUTCFullYear()).toBe(1950);
    expect(new Date(50, 0, 1).getFullYear()).toBe(1950);
    expect(d?.getTime()).not.toBe(Date.UTC(50, 0, 1));
  });
});

describe("dateValue follows the common value-wrapper pattern", () => {
  it("preserves the wire string verbatim beside the components it decoded", () => {
    expect(dateValue("19880705")).toStrictEqual({
      source: "19880705",
      year: 1988,
      month: 7,
      day: 5,
    });
  });

  it("returns a frozen plain object, fresh per call", () => {
    const a = dateValue("19880705");
    const b = dateValue("19880705");
    expect(Object.isFrozen(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(a).toStrictEqual(b);
    expect(Object.getPrototypeOf(a)).toBe(Object.prototype);
  });

  it("never returns a partially populated value: a refusal carries no components", () => {
    // The contrast that matters. `decimalValue` keeps an unreadable source because it REPLACES
    // the field on the model, so dropping it would lose the wire value. This wrapper replaces
    // nothing: `claim.dateOfBirth` and `header.dateOfService` are still the verbatim strings they
    // were, so a refusal here loses nothing and a half-filled value would be worse than none.
    expect(dateValue("19880732")).toBeUndefined();
    expect(dateValue("1988")).toBeUndefined();
  });

  it("takes an optional field straight off a parsed model without a coalesce", () => {
    const t = parseTelecom(telecomClaimWithDates());
    const c = claim(t);
    expect(c?.dateOfBirth).toBe("19850722");
    expect(toISO(dateValue(c?.dateOfBirth))).toBe("1985-07-22");
  });
});

describe("toObject returns the shared DateParts shape", () => {
  it("has exactly the stated components, with a spec-native month", () => {
    const parts = toObject(dateValue("19880705"));
    expect(Object.keys(parts ?? {})).toStrictEqual(["year", "month", "day"]);
    expect(parts?.month).toBe(7);
    expect(parts?.year).toBe(1988);
    expect(parts?.day).toBe(5);
  });

  it("carries no source, isValid, precision, raw or offsetMinutes key", () => {
    const parts = toObject(dateValue("19880705"));
    for (const forbidden of ["source", "isValid", "precision", "raw", "valid", "offsetMinutes"]) {
      expect(Object.hasOwn(parts ?? {}, forbidden), forbidden).toBe(false);
    }
    // Absent, not present holding `undefined`: the distinction the shape rests on.
    expect(Object.values(parts ?? {}).some((v) => v === undefined)).toBe(false);
  });

  it("returns a frozen plain object, fresh per call", () => {
    const a = toObject(dateValue("19880705"));
    const b = toObject(dateValue("19880705"));
    expect(Object.isFrozen(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(Object.getPrototypeOf(a)).toBe(Object.prototype);
  });

  it("survives a hand-built value whose components are out of range", () => {
    // The components are the decode and are authoritative; they are re-checked so a hand-built
    // value can never render a thirteenth month or a day the calendar does not have.
    expectAllThreeUndefined({ source: "x", year: 2026, month: 13, day: 1 });
    expectAllThreeUndefined({ source: "x", year: 2026, month: 0, day: 1 });
    expectAllThreeUndefined({ source: "x", year: 2026, month: 6, day: 32 });
    expectAllThreeUndefined({ source: "x", year: 2026, month: 6, day: 0 });
    expectAllThreeUndefined({ source: "x", year: 2026.5, month: 6, day: 1 });
    expectAllThreeUndefined({ source: "x", year: Number.NaN, month: 6, day: 1 });
  });

  it("follows the components, not source, when a hand-built value makes them disagree", () => {
    // `source` is the record of what the wire said; the components are the decode. Only
    // `dateValue` can produce a value where they agree, and it always does.
    const contradictory: DateValue = { source: "19880705", year: 1999, month: 1, day: 2 };
    expect(toObject(contradictory)).toStrictEqual({ year: 1999, month: 1, day: 2 });
    expect(toISO(contradictory)).toBe("1999-01-02");
  });
});

describe("toISO renders the stated precision and nothing more", () => {
  it("renders a whole calendar day and appends nothing, because no offset was stated", () => {
    expect(toISO(dateValue("19880705"))).toBe("1988-07-05");
    expect(toISO(dateValue("20260629"))).toBe("2026-06-29");
    expect(toISO(dateValue("19880705"))).not.toContain("T");
    expect(toISO(dateValue("19880705"))).not.toContain("Z");
    expect(toISO(dateValue("19880705"))).not.toContain("+");
  });

  it("reports exactly the components toObject reports", () => {
    for (const raw of ["19880705", "20260629", "00500101", "20000229", "99991231"]) {
      const v = dateValue(raw);
      const parts: DateParts = toObject(v) ?? {};
      const iso = toISO(v) ?? "";
      expect(iso.split("-")).toHaveLength(3);
      expect(Number(iso.slice(0, 4))).toBe(parts.year);
      expect(Number(iso.slice(5, 7))).toBe(parts.month);
      expect(Number(iso.slice(8, 10))).toBe(parts.day);
    }
  });

  it("zero-pads a year below 1000 to four digits rather than shortening the string", () => {
    expect(toISO(dateValue("00500101"))).toBe("0050-01-01");
    expect(toISO(dateValue("09990630"))).toBe("0999-06-30");
    expect(toISO(dateValue("00010101"))).toBe("0001-01-01");
  });
});

describe("toDate is honest about the timezone", () => {
  it("returns undefined when no zone is determinate", () => {
    const v = dateValue("20260629");
    // `{}` is the whole of it: `exactOptionalPropertyTypes` is on, so an explicit
    // `assumeOffsetMinutes: undefined` is not expressible in TypeScript at all, and at run time
    // it reaches the same `options?.assumeOffsetMinutes === undefined` branch this asserts.
    expect(toDate(v)).toBeUndefined();
    expect(toDate(v, {})).toBeUndefined();
  });

  it("reads no zone from the host, by construction", () => {
    const code = codeOnly(readSource("src/common/date-conversion.ts"));
    for (const forbidden of [
      "getTimezoneOffset",
      "Intl",
      "Date.parse",
      "toLocale",
      "setFullYear",
      "setHours",
      "Date.UTC",
      "process.env",
      "toISOString",
    ]) {
      expect(code.includes(forbidden), forbidden).toBe(false);
    }
    expect(code).toContain("setUTCFullYear");
    expect(code).toContain("setUTCHours");
  });

  it("applies a stated offset, including an explicit zero", () => {
    const v = dateValue("20260629");
    expect(toDate(v, { assumeOffsetMinutes: 0 })?.toISOString()).toBe("2026-06-29T00:00:00.000Z");
    expect(toDate(v, { assumeOffsetMinutes: -300 })?.toISOString()).toBe(
      "2026-06-29T05:00:00.000Z",
    );
    expect(toDate(v, { assumeOffsetMinutes: 330 })?.toISOString()).toBe("2026-06-28T18:30:00.000Z");
    expect(toDate(v, { assumeOffsetMinutes: 600 })?.toISOString()).toBe("2026-06-28T14:00:00.000Z");
  });

  it("refuses a non-finite or unrepresentable offset rather than answering an Invalid Date", () => {
    const v = dateValue("20260629");
    expect(toDate(v, { assumeOffsetMinutes: Number.NaN })).toBeUndefined();
    expect(toDate(v, { assumeOffsetMinutes: Number.POSITIVE_INFINITY })).toBeUndefined();
    expect(toDate(v, { assumeOffsetMinutes: Number.MAX_SAFE_INTEGER })).toBeUndefined();
    // An Invalid Date is an object that is not `undefined` and answers NaN to every question
    // asked of it: exactly the partial answer the shared rules forbid.
    expect(new Date(Number.NaN).getTime()).toBeNaN();
  });

  it("leaves the value's own precision untouched by the call", () => {
    const v = dateValue("20260629");
    const before = toObject(v);
    const isoBefore = toISO(v);
    expect(toDate(v, { assumeOffsetMinutes: -300 })?.toISOString()).toBe(
      "2026-06-29T05:00:00.000Z",
    );
    expect(toObject(v)).toStrictEqual(before);
    expect(toISO(v)).toBe(isoBefore);
  });

  it("fills the time of day to midnight for instant construction only", () => {
    const d = toDate(dateValue("20260629"), { assumeOffsetMinutes: 0 });
    expect(d?.getUTCHours()).toBe(0);
    expect(d?.getUTCMinutes()).toBe(0);
    expect(d?.getUTCSeconds()).toBe(0);
    expect(d?.getUTCMilliseconds()).toBe(0);
    expect(Object.keys(toObject(dateValue("20260629")) ?? {})).toStrictEqual([
      "year",
      "month",
      "day",
    ]);
  });
});

describe("the properties behind the skipped rows", () => {
  it("decodes exactly one wire form, and it is always a whole calendar day (R1, R10)", () => {
    // Every accepted value states year, month and day and nothing else. That is the property
    // behind the R1 skip (there is no year-only value) and half of the R10 skip (there is no
    // value with no year).
    for (const raw of ["19880705", "20260629", "00500101", "20000229", "99991231", "00010101"]) {
      expect(Object.keys(toObject(dateValue(raw)) ?? {}), raw).toStrictEqual([
        "year",
        "month",
        "day",
      ]);
    }
  });

  it("refuses every shorter digit run, so no lower precision is reachable (R1)", () => {
    for (const raw of ["2026", "202606", "20260", "2026062", "20", ""]) {
      expect(dateValue(raw), raw).toBeUndefined();
    }
  });

  it("refuses every time-bearing shape, so no value is time-only (R10)", () => {
    for (const raw of ["093000", "09:30:00", "T093000", "20260629093000", "0930"]) {
      expect(dateValue(raw), raw).toBeUndefined();
    }
  });

  it("never carries an offsetMinutes key, so a stated offset cannot be expressed (R5, R6)", () => {
    for (const raw of ["19880705", "20260629", "00500101"]) {
      expect(Object.hasOwn(toObject(dateValue(raw)) ?? {}, "offsetMinutes"), raw).toBe(false);
      expect(toISO(dateValue(raw))?.endsWith("Z"), raw).toBe(false);
      expect(toDate(dateValue(raw)), raw).toBeUndefined();
    }
  });

  it("never carries a millisecond key, so a stated fraction cannot be expressed (R7)", () => {
    for (const raw of ["19880705", "20260629"]) {
      expect(Object.hasOwn(toObject(dateValue(raw)) ?? {}, "millisecond"), raw).toBe(false);
      expect(toISO(dateValue(raw)), raw).not.toContain(".");
    }
  });
});

describe("both standards reach the same three names", () => {
  it("converts a Telecom Date of Service and a Telecom Date of Birth, the two declared forms", () => {
    const t = parseTelecom(telecomClaimWithDates());
    expect(t.header.dateOfService).toBe("20260629");
    const c = claim(t);
    expect(c?.dateOfBirth).toBe("19850722");

    expect(toObject(dateValue(t.header.dateOfService))).toStrictEqual({
      year: 2026,
      month: 6,
      day: 29,
    });
    expect(toISO(dateValue(c?.dateOfBirth))).toBe("1985-07-22");
    expect(toDate(dateValue(c?.dateOfBirth), { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "1985-07-22T00:00:00.000Z",
    );
  });

  it("accepts a SCRIPT value through the same three names, and answers undecoded, never a guess", () => {
    const msg = parseScript(SCRIPT_NEWRX);
    const rx = newRx(msg);
    // The SCRIPT values are surfaced verbatim and are UNCHANGED by any of this.
    expect(msg.header.sentTime).toBe("2026-01-15T09:30:00Z");
    expect(rx?.patient?.dateOfBirth).toBe("1990-04-12");
    expect(rx?.medication?.writtenDate).toBe("2026-01-15");

    // The same three functions take them, do not throw, and answer `undefined`: this repository
    // declares no wire form for any SCRIPT date field, so decoding one would mean importing a
    // form from a document this package may not cite.
    for (const raw of [
      msg.header.sentTime,
      rx?.patient?.dateOfBirth,
      rx?.medication?.writtenDate,
    ]) {
      expect(dateValue(raw)).toBeUndefined();
      expectAllThreeUndefined(dateValue(raw));
    }
  });

  it("converts a SCRIPT value the moment its wire form IS one this package declares", () => {
    // The surface is structural, not per-standard: nothing about it is Telecom-only. A SCRIPT
    // sender writing the eight-digit form reaches the same answer through the same names.
    const msg = parseScript(
      `<Message version="2017071"><Header><MessageID>SYNTH-MSG-0002</MessageID></Header>` +
        `<Body><NewRx><Patient><HumanPatient>` +
        `<DateOfBirth><Date>19850722</Date></DateOfBirth>` +
        `</HumanPatient></Patient><MedicationPrescribed>` +
        `<DrugDescription>Amoxicillin 500 MG Oral Capsule</DrugDescription>` +
        `</MedicationPrescribed></NewRx></Body></Message>`,
    );
    expect(newRx(msg)?.patient?.dateOfBirth).toBe("19850722");
    expect(toISO(dateValue(newRx(msg)?.patient?.dateOfBirth))).toBe("1985-07-22");
  });

  it("refuses the Telecom fields whose form this repository states nowhere", () => {
    // Other Payer Date (443-E8) and Previous Date Of Fill (530-FU) are documented as verbatim
    // with no form. Their fixture values happen to be eight digits, which is exactly why this
    // is asserted: the decode has to come from a declaration, never from what a sample looks
    // like, and a reader must be able to see that the two are being kept apart on purpose.
    const cobSource = readSource("src/telecom/cob.ts");
    const durSource = readSource("src/telecom/response.ts");
    expect(cobSource).toContain("Other Payer Date (443-E8), verbatim, when present.");
    expect(cobSource).not.toContain("443-E8), verbatim (`CCYYMMDD`");
    expect(durSource).toContain("Previous Date Of Fill (530-FU), verbatim, when present.");
    expect(durSource).not.toContain("530-FU), verbatim (`CCYYMMDD`");
  });

  it("declares CCYYMMDD on exactly the two fields the enumeration named", () => {
    expect(readSource("src/telecom/header.ts")).toContain(
      "401-D1: Date of Service, verbatim (`CCYYMMDD` on the wire).",
    );
    expect(readSource("src/telecom/claim.ts")).toContain(
      "Date of Birth (304-C4) from the Patient segment, verbatim (`CCYYMMDD`). PHI.",
    );
    for (const rel of ["src/script/header.ts", "src/script/newrx.ts"]) {
      expect(readSource(rel), rel).not.toContain("CCYYMMDD");
    }
  });
});

describe("the pre-existing surface is untouched", () => {
  it("leaves every date-bearing field on the parsed structures a verbatim string", () => {
    const t = parseTelecom(telecomClaimWithDates());
    expect(typeof t.header.dateOfService).toBe("string");
    expect(t.header.dateOfService).toBe("20260629");
    expect(typeof claim(t)?.dateOfBirth).toBe("string");

    const rx = newRx(parseScript(SCRIPT_NEWRX));
    expect(typeof rx?.patient?.dateOfBirth).toBe("string");
    expect(rx?.patient?.dateOfBirth).toBe("1990-04-12");
    expect(typeof rx?.medication?.writtenDate).toBe("string");
  });

  it("adds no import to the conversion modules beyond the value they read", () => {
    expect(codeOnly(readSource("src/common/date.ts"))).not.toContain("import");
    const specifiers = codeOnly(readSource("src/common/date-conversion.ts")).match(
      /from "([^"]+)"/g,
    );
    expect(specifiers).toStrictEqual(['from "./date.js"']);
  });

  it("adds no dependency of any kind, and leaves the engine floor where it was", () => {
    const manifest: unknown = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(manifest).toMatchObject({
      engines: { node: ">=22.0.0" },
      dependencies: { "fast-xml-parser": "^5.10.1" },
    });
    if (typeof manifest !== "object" || manifest === null) throw new Error("no manifest");
    expect(Object.keys((manifest as { dependencies: object }).dependencies)).toStrictEqual([
      "fast-xml-parser",
    ]);
    expect("peerDependencies" in manifest).toBe(false);
    expect("optionalDependencies" in manifest).toBe(false);
  });
});

describe("README.md documents the surface", () => {
  const readme = readSource("README.md");
  // Paragraph-joined: the section is hard-wrapped by the repo's prettier, so a sentence the
  // gate looks for is regularly split across two lines and a line-by-line match would miss it.
  const section = readme.slice(readme.indexOf("### Dates and times")).replace(/\s+/g, " ");

  it("documents the three functions together", () => {
    expect(readme).toContain("### Dates and times");
    expect(section).toContain("toObject");
    expect(section).toContain("toISO");
    expect(section).toContain("toDate");
  });

  it("lists the wire form decoded and says the parsed fields stay verbatim strings", () => {
    expect(section).toContain("CCYYMMDD");
    expect(section).toContain("401-D1");
    expect(section).toContain("304-C4");
    expect(section).toContain("verbatim string");
    expect(section).toContain("opt-in");
  });

  it("states the offset-less toDate rule explicitly", () => {
    expect(section).toContain("the host machine's timezone is never read and UTC is never assumed");
  });

  it("shows a worked import-aliasing example for two @cosyte parsers in one file", () => {
    expect(section).toContain("toISO as ncpdpToISO");
    expect(section).toContain("@cosyte/hl7");
  });

  it("shows values the functions actually produce", () => {
    expect(toObject(dateValue("19880705"))).toStrictEqual({ year: 1988, month: 7, day: 5 });
    expect(toISO(dateValue("19880705"))).toBe("1988-07-05");
    expect(toDate(dateValue("19880705"))).toBeUndefined();
    expect(toDate(dateValue("19880705"), { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "1988-07-05T00:00:00.000Z",
    );
    expect(toDate(dateValue("19880705"), { assumeOffsetMinutes: -300 })?.toISOString()).toBe(
      "1988-07-05T05:00:00.000Z",
    );
    expect(dateValue("1988-07-05")).toBeUndefined();
  });
});
