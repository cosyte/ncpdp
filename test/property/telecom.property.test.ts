/**
 * Property-based conformance tests for the Telecom parser, driven by the shared
 * `@cosyte/test-utils` invariant runners. The kit owns the **invariants**; this
 * parser owns the **format-specific arbitraries** below.
 *
 * Implemented for NCPDP-5 (Telecom foundation + B1 read):
 *
 *   - **lenient-mode** — arbitrary/hostile byte input never throws outside the
 *     Telecom fatal set, and every emitted warning carries a registered code +
 *     byte-offset position;
 *   - **immutability** — a parsed transaction rejects in-place mutation;
 *   - **warning/fatal-code stability** — the sorted code sets are snapshotted as
 *     tripwires (a rename/removal is a breaking change);
 *   - **byte fuzz #1** — the framing detector + field tokenizer survive random
 *     control-character soup.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  immutabilityProperty,
  lenientNeverThrowsProperty,
  sortedCodeSet,
} from "@cosyte/test-utils";

import { fuzzRuns } from "./_fuzz-config.js";

import {
  parseTelecom,
  telecomMoney,
  responseStatus,
  responseDur,
  compound,
  cobOtherPayments,
  NcpdpTelecomParseError,
  TELECOM_FATAL_CODES,
  TELECOM_WARNING_CODES,
  type NcpdpTelecomWarning,
  type TelecomTransaction,
} from "../../src/telecom/index.js";
import {
  FS,
  GS,
  RS,
  buildHeader,
  buildTransmission,
  buildResponseTransmission,
  syntheticB1,
} from "../_helpers/build-telecom.js";

const POSITIVE_DISPOSITIONS = new Set(["paid", "captured", "approved", "duplicate"]);

const fatalCodes = new Set<string>(Object.values(TELECOM_FATAL_CODES));
const knownWarningCodes = new Set<string>(Object.values(TELECOM_WARNING_CODES));

/**
 * Hostile / quirky input: random text, control-character soup, and
 * structurally-plausible D.0 headers followed by framed-but-garbled bodies, so
 * the lenient parser is exercised across recover-vs-fatal boundaries.
 */
function hostileInput(): fc.Arbitrary<string> {
  const separators = fc.constantFrom(FS, GS, RS, "");
  const soup = fc
    .array(fc.oneof(fc.string(), separators), { maxLength: 12 })
    .map((p) => p.join(""));
  const framedBody = soup.map((body) => buildHeader() + RS + body);
  return fc.oneof(fc.string(), soup, framedBody, fc.constant(syntheticB1()));
}

/** Well-formed transmissions that parse cleanly, with a random transaction code. */
function parsableTelecom(): fc.Arbitrary<string> {
  return fc.constantFrom("B1", "B2", "B3").map((code) =>
    buildTransmission({ transactionCode: code }, [
      [
        {
          id: "07",
          fields: [
            ["D7", "00093123456"],
            ["E7", "30000"],
          ],
        },
      ],
    ]),
  );
}

describe("Telecom conformance (archetype invariants)", () => {
  it("is lenient — arbitrary input never throws outside the fatal set; warnings carry code + position", () => {
    lenientNeverThrowsProperty({
      arbitrary: hostileInput(),
      parse: (raw: string) => parseTelecom(raw),
      isFatal: (err) => err instanceof NcpdpTelecomParseError && fatalCodes.has(err.code),
      getWarnings: (parsed) => (parsed as TelecomTransaction).warnings,
      isKnownCode: (code) => knownWarningCodes.has(code),
      hasPositionalContext: (warning) =>
        typeof (warning as NcpdpTelecomWarning).position?.byteOffset === "number",
    });
  });

  it("is immutable — a parsed transaction rejects in-place warning mutation", () => {
    immutabilityProperty({
      arbitrary: parsableTelecom(),
      parse: (raw: string) => parseTelecom(raw),
      mutate: (t) => (t.warnings as unknown[]).push({ code: "X" }),
      getSnapshot: (t) => t.warnings.map((w) => w.code),
    });
  });

  it("byte fuzz #1 — framed control-character soup never throws a non-fatal", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(FS, GS, RS, "A", "M", "0", "7", "1", "x"), { maxLength: 40 }),
        (chars) => {
          const raw = buildHeader() + chars.join("");
          try {
            parseTelecom(raw);
            return true;
          } catch (err) {
            return err instanceof NcpdpTelecomParseError && fatalCodes.has(err.code);
          }
        },
      ),
      { numRuns: fuzzRuns(100) },
    );
  });

  it("the dispensed product id survives parse for clean inputs", () => {
    fc.assert(
      fc.property(parsableTelecom(), (raw) => {
        const t = parseTelecom(raw);
        return t.segments.some((s) => s.fields.some((f) => f.id === "D7" && f.value.length > 0));
      }),
    );
  });

  it("safety — any reject code forces rejected, never a paid/positive disposition", () => {
    const statusCode = fc.constantFrom("P", "C", "A", "D", "Q", "F", "R", "Z", "");
    const rejectCodes = fc.array(fc.constantFrom("70", "75", "M1", "ZZ"), {
      minLength: 1,
      maxLength: 4,
    });
    fc.assert(
      fc.property(statusCode, rejectCodes, (status, rejects) => {
        const raw = buildResponseTransmission({ transactionCode: "B1" }, [
          { id: "21", fields: [["AN", status], ...rejects.map((c) => ["FB", c] as const)] },
        ]);
        const s = responseStatus(parseTelecom(raw));
        return (
          s?.disposition === "rejected" &&
          !POSITIVE_DISPOSITIONS.has(s.disposition) &&
          s.rejectCodes.length === rejects.length
        );
      }),
    );
  });

  it("safety — money decodes to an exact 2-place decimal, never float-rounded", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(..."0123456789"), { maxLength: 12 }), (chars) => {
        const source = chars.join("");
        const m = telecomMoney(source);
        if (source === "") return m.isValid === false;
        if (!/^-?\d+\.\d{2}$/.test(m.amount ?? "")) return false;
        // Removing the dot and stripping leading zeros reconstructs the digit run.
        const reconstructed = (m.amount ?? "").replace(".", "").replace(/^0+/, "") || "0";
        const expected = source.replace(/^0+/, "") || "0";
        return reconstructed === expected && m.source === source;
      }),
    );
  });

  it("safety — every returned DUR alert is preserved, none collapsed", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("DD", "TD", "ID", "HD", "ZZ"), { minLength: 1, maxLength: 6 }),
        (reasons) => {
          const raw = buildResponseTransmission({ transactionCode: "B1" }, [
            { id: "24", fields: reasons.map((r) => ["E4", r] as const) },
          ]);
          const dur = responseDur(parseTelecom(raw));
          return (
            dur.length === reasons.length &&
            dur.every((d, i) => d.reasonForServiceCode === reasons[i])
          );
        },
      ),
    );
  });

  it("safety — every compound ingredient is preserved, none dropped or merged", () => {
    const ndc = fc
      .array(fc.constantFrom(..."0123456789"), { minLength: 11, maxLength: 11 })
      .map((d) => d.join(""));
    fc.assert(
      fc.property(fc.array(ndc, { minLength: 1, maxLength: 8 }), (ndcs) => {
        const fields: Array<readonly [string, string]> = [];
        for (const id of ndcs) {
          fields.push(["RE", "03"]);
          fields.push(["TE", id]);
          fields.push(["ED", "0001000"]);
        }
        const raw = buildTransmission({ transactionCode: "B1" }, [[{ id: "10", fields }]]);
        const c = compound(parseTelecom(raw));
        return (
          c?.ingredients.length === ndcs.length &&
          c.ingredients.every((ing, i) => ing.productId === ndcs[i])
        );
      }),
    );
  });

  it("safety — every other-payer amount-paid row is preserved with its amount", () => {
    const amount = fc
      .array(fc.constantFrom(..."0123456789"), { minLength: 1, maxLength: 7 })
      .map((d) => d.join(""));
    fc.assert(
      fc.property(fc.array(amount, { minLength: 1, maxLength: 6 }), (amounts) => {
        const fields: Array<readonly [string, string]> = [
          ["5C", "01"],
          ["7C", "PRIMARY"],
        ];
        for (const a of amounts) {
          fields.push(["HC", "07"]);
          fields.push(["DV", a]);
        }
        const raw = buildTransmission({ transactionCode: "B1" }, [[{ id: "05", fields }]]);
        const payers = cobOtherPayments(parseTelecom(raw));
        return (
          payers.length === 1 &&
          payers[0]?.amountsPaid.length === amounts.length &&
          payers[0].amountsPaid.every((row, i) => row.amount.source === amounts[i])
        );
      }),
    );
  });

  it("warning-code surface is stable (rename/removal is a breaking change)", () => {
    expect(sortedCodeSet(TELECOM_WARNING_CODES)).toMatchInlineSnapshot(`
      [
        "NCPDP_TELECOM_COB_COUNT_MISMATCH",
        "NCPDP_TELECOM_COMPOUND_COUNT_MISMATCH",
        "NCPDP_TELECOM_MALFORMED_FIELD",
        "NCPDP_TELECOM_MISSING_SEGMENT_ID",
        "NCPDP_TELECOM_MULTI_TRANSACTION_TRUNCATED",
        "NCPDP_TELECOM_STATUS_CONFLICT",
        "NCPDP_TELECOM_UNKNOWN_DUR_REASON",
        "NCPDP_TELECOM_UNKNOWN_REJECT_CODE",
        "NCPDP_TELECOM_UNKNOWN_RESPONSE_STATUS",
        "NCPDP_TELECOM_UNKNOWN_SEGMENT",
        "NCPDP_TELECOM_VF6_NOT_DECODED",
      ]
    `);
  });

  it("fatal-code surface is stable", () => {
    expect(sortedCodeSet(TELECOM_FATAL_CODES)).toMatchInlineSnapshot(`
      [
        "EMPTY_INPUT",
        "NCPDP_TELECOM_INVALID_FRAMING",
        "NCPDP_TELECOM_NO_HEADER",
        "NCPDP_TELECOM_UNSUPPORTED_VERSION",
      ]
    `);
  });
});
