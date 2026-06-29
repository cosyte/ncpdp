/**
 * Property-based conformance tests for the SCRIPT parser, driven by the shared
 * `@cosyte/test-utils` invariant runners. The kit owns the **invariants**; this
 * parser owns the **format-specific arbitraries** below.
 *
 * Implemented for NCPDP-1 (SCRIPT NewRx structural read):
 *
 *   - **lenient-mode** — arbitrary/hostile input never throws a non-fatal, and
 *     every emitted warning carries a registered code + XPath position;
 *   - **immutability** — a parsed message rejects in-place mutation;
 *   - **warning-code stability** — the sorted code set is snapshotted as a
 *     tripwire (a rename/removal is a breaking change).
 *
 * The **round-trip** invariant stays `it.todo` until a SCRIPT serializer lands in
 * a later phase; the body is written against the real runner so it typechecks now.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  immutabilityProperty,
  lenientNeverThrowsProperty,
  roundTripProperty,
  sortedCodeSet,
} from "@cosyte/test-utils";

import {
  parseScript,
  newRx,
  NcpdpScriptParseError,
  SCRIPT_FATAL_CODES,
  SCRIPT_WARNING_CODES,
  type NcpdpScriptWarning,
  type ResponseKind,
  type ScriptMessage,
} from "../../src/index.js";

const fatalCodes = new Set<string>(Object.values(SCRIPT_FATAL_CODES));
const knownWarningCodes = new Set<string>(Object.values(SCRIPT_WARNING_CODES));

/**
 * Hostile / quirky input generator. Mixes free-form strings with near-XML and
 * structurally-plausible SCRIPT skeletons carrying odd versions/transactions, so
 * the lenient parser is exercised across recover-vs-fatal boundaries.
 */
function hostileInput(): fc.Arbitrary<string> {
  const versions = fc.constantFrom("2017071", "2022011", "2099001", "10.6", "", "garbage");
  const transactions = fc.constantFrom("NewRx", "RxRenewalRequest", "CancelRx", "Zzz");
  const structured = fc
    .tuple(versions, transactions)
    .map(
      ([v, t]) =>
        `<Message version="${v}"><Body><${t}><MedicationPrescribed><DrugDescription>x</DrugDescription></MedicationPrescribed></${t}></Body></Message>`,
    );
  return fc.oneof(fc.string(), structured, fc.constant("<Message/>"));
}

/** A small generator of well-formed SCRIPT messages that parse cleanly. */
function parsableScript(): fc.Arbitrary<string> {
  return fc
    .constantFrom("2017071", "2022011", "2099001", "")
    .map(
      (v) =>
        `<Message${v === "" ? "" : ` version="${v}"`}><Header><MessageID>SYNTH</MessageID></Header><Body><NewRx><MedicationPrescribed><DrugDescription>Synthetic 1 MG</DrugDescription></MedicationPrescribed></NewRx></Body></Message>`,
    );
}

/**
 * Well-formed SCRIPT response messages (`<Status>`/`<Error>`/`<Verify>`) with a
 * random code and a correlation id, for the response-spine safety invariants.
 */
function responseScript(): fc.Arbitrary<{ kind: ResponseKind; relatesTo: string; raw: string }> {
  return fc
    .tuple(
      fc.constantFrom<ResponseKind>("Status", "Error", "Verify"),
      fc.stringMatching(/^[0-9]{3}$/),
      fc.stringMatching(/^[A-Z0-9-]{1,16}$/),
    )
    .map(([kind, code, relatesTo]) => ({
      kind,
      relatesTo,
      raw: `<Message version="2017071"><Header><RelatesToMessageID>${relatesTo}</RelatesToMessageID></Header><Body><${kind}><Code>${code}</Code></${kind}></Body></Message>`,
    }));
}

describe("SCRIPT conformance (archetype invariants)", () => {
  it("is lenient — arbitrary input never throws a non-fatal; every warning has a known code + position", () => {
    lenientNeverThrowsProperty({
      arbitrary: hostileInput(),
      parse: (raw: string) => parseScript(raw),
      isFatal: (err) => err instanceof NcpdpScriptParseError && fatalCodes.has(err.code),
      getWarnings: (parsed) => (parsed as ScriptMessage).warnings,
      isKnownCode: (code) => knownWarningCodes.has(code),
      hasPositionalContext: (warning) =>
        typeof (warning as NcpdpScriptWarning).position?.path === "string",
    });
  });

  it("is immutable — a parsed message rejects in-place warning mutation", () => {
    immutabilityProperty({
      arbitrary: parsableScript(),
      parse: (raw: string) => parseScript(raw),
      mutate: (m) => (m.warnings as unknown[]).push({ code: "X" }),
      getSnapshot: (m) => m.warnings.map((w) => w.code),
    });
  });

  it("medication description survives parse for clean inputs", () => {
    fc.assert(
      fc.property(parsableScript(), (raw) => {
        const med = newRx(parseScript(raw))?.medication;
        return med?.description === "Synthetic 1 MG";
      }),
    );
  });

  it("warning-code surface is stable (rename/removal is a breaking change)", () => {
    expect(sortedCodeSet(SCRIPT_WARNING_CODES)).toMatchInlineSnapshot(`
      [
        "NCPDP_SCRIPT_LIFECYCLE_AMBIGUOUS_OUTCOME",
        "NCPDP_SCRIPT_LIFECYCLE_OUTCOME_UNRECOGNIZED",
        "NCPDP_SCRIPT_MISSING_REQUIRED_ELEMENT",
        "NCPDP_SCRIPT_RESPONSE_AMBIGUOUS_DISPOSITION",
        "NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE",
        "NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY",
        "NCPDP_SCRIPT_STRENGTH_CODED_AND_EXPLICIT",
        "NCPDP_SCRIPT_UNSUPPORTED_TRANSACTION",
        "NCPDP_SCRIPT_UNSUPPORTED_VERSION_TOLERATED",
        "NCPDP_SCRIPT_VERSION_ABSENT",
      ]
    `);
  });

  it("an Error response is never read as a success (fail-safe disposition)", () => {
    fc.assert(
      fc.property(responseScript(), ({ kind, raw }) => {
        const msg = parseScript(raw);
        if (kind === "Error") {
          return msg.disposition === "error" && msg.asStatus() === undefined;
        }
        return msg.disposition !== undefined && msg.asError() === undefined;
      }),
    );
  });

  it("RelatesToMessageID round-trips into the correlation accessor", () => {
    fc.assert(
      fc.property(responseScript(), ({ relatesTo, raw }) => {
        const msg = parseScript(raw);
        return msg.correlatesTo === relatesTo && msg.header.relatesToMessageId === relatesTo;
      }),
    );
  });

  it("fatal-code surface is stable", () => {
    expect(sortedCodeSet(SCRIPT_FATAL_CODES)).toMatchInlineSnapshot(`
      [
        "EMPTY_INPUT",
        "NCPDP_SCRIPT_NOT_XML",
        "NCPDP_SCRIPT_NO_MESSAGE_ROOT",
        "NCPDP_SCRIPT_UNSUPPORTED_VERSION",
      ]
    `);
  });

  // TODO: flip `it.todo` -> `it` once a SCRIPT serializer lands.
  it.todo("round-trips — parse(serialize(x)) is structurally equal to x", () => {
    roundTripProperty({
      arbitrary: parsableScript(),
      serialize: (raw) => raw,
      parse: (raw) => raw,
      equals: (a, b) => a === b,
    });
  });
});
