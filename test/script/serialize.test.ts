/**
 * SCRIPT serializer + builder conformance.
 *
 * Two contracts are exercised here:
 *
 *   - **Golden round-trip**: every synthetic fixture, once parsed, serializes to
 *     XML that re-parses to the same canonical form. The serializer is the
 *     conservative (emit) half of Postel's Law; the read is lossy, so equality is
 *     by canonical form (re-serialize), not byte-identity with the original.
 *   - **Builder**: refuses messages that are invalid by construction with a typed
 *     {@link NcpdpScriptBuildError}, and its output re-parses with zero warnings.
 *   - **Emit refuses an unmodeled transaction**: a body this library does not model
 *     has nothing under it that emit could reproduce, so every publicly reachable
 *     emit route raises the same typed {@link NcpdpScriptBuildError} rather than
 *     returning a well-formed document with the transaction body deleted.
 */

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  parseScript,
  serializeScript,
  buildNewRx,
  buildScriptResponse,
  NcpdpScriptBuildError,
  NcpdpScriptParseError,
  SCRIPT_BUILD_CODES,
  SCRIPT_BUILD_MESSAGES,
} from "../../src/index.js";
// The `@cosyte/ncpdp/common` subpath, imported separately on purpose: the new
// refusal code has to be reachable from the same public subpaths as the build
// codes published before it, not only from the root entrypoint.
import {
  SCRIPT_BUILD_CODES as COMMON_SCRIPT_BUILD_CODES,
  SCRIPT_BUILD_MESSAGES as COMMON_SCRIPT_BUILD_MESSAGES,
  NcpdpScriptBuildError as CommonNcpdpScriptBuildError,
} from "../../src/common/index.js";
import { loadScriptFixture } from "../_helpers/load-fixture.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "script");

/** Parses cleanly? A few fixtures exercise the fatal path (e.g. a pre-XML version) and never parse. */
function parses(name: string): boolean {
  try {
    parseScript(loadScriptFixture(name));
    return true;
  } catch (err) {
    if (err instanceof NcpdpScriptParseError) return false;
    throw err;
  }
}

const fixtures = readdirSync(fixtureDir)
  .filter((f) => f.endsWith(".xml"))
  .filter(parses);

/** Does this fixture carry a transaction the library models (so emit produces a document)? */
function modeled(name: string): boolean {
  return parseScript(loadScriptFixture(name)).body.kind !== "unsupported";
}

const emittable = fixtures.filter(modeled);
const refused = fixtures.filter((f) => !modeled(f));

describe("SCRIPT serializer: golden round-trip over every fixture", () => {
  // The round-trip corpus is a PARTITION of the parsing fixtures, not a subset:
  // every fixture is either emitted below or refused in the unmodeled-transaction
  // suite further down, and both sides are non-empty. Asserting the split keeps a
  // fixture from quietly falling out of the golden corpus.
  it("partitions every parsing fixture into emitted and refused, with both non-empty", () => {
    expect(emittable.length + refused.length).toBe(fixtures.length);
    expect(emittable.length).toBeGreaterThan(0);
    expect(refused.length).toBeGreaterThan(0);
  });

  it.each(emittable)("round-trips %s to a stable canonical form", (name) => {
    const original = parseScript(loadScriptFixture(name));
    const once = serializeScript(original);
    const reparsed = parseScript(once);
    const twice = serializeScript(reparsed);

    // Idempotent: re-parsing canonical output and re-serializing is a no-op.
    expect(twice).toBe(once);
    // Structural equality by canonical form (lossy read ⇒ not byte-identical).
    expect(reparsed.toString()).toBe(original.toString());
    // The canonical output re-parses without raising new warnings.
    expect(reparsed.warnings.length).toBeLessThanOrEqual(original.warnings.length);
  });

  it("toString() on the message equals serializeScript()", () => {
    const msg = parseScript(loadScriptFixture("newrx-basic.xml"));
    expect(msg.toString()).toBe(serializeScript(msg));
  });

  it("emits the version as the root attribute when present", () => {
    const xml = parseScript(loadScriptFixture("newrx-basic.xml")).toString();
    expect(xml.startsWith("<Message")).toBe(true);
  });

  it("omits the version attribute when the source had none", () => {
    const xml = parseScript(loadScriptFixture("newrx-no-version.xml")).toString();
    expect(xml).not.toContain("version=");
  });

  it("XML-escapes text-significant characters", () => {
    const msg = buildNewRx({
      header: { messageId: "SYNTH-amp" },
      medication: { description: "Acetaminophen & Codeine <325 MG>" },
    });
    const xml = msg.toString();
    expect(xml).toContain("Acetaminophen &amp; Codeine &lt;325 MG&gt;");
    expect(xml).not.toContain("Codeine <325");
  });
});

describe("SCRIPT builder: refuses invalid-by-construction messages", () => {
  it("builds a minimal NewRx that re-parses with zero warnings", () => {
    const msg = buildNewRx({
      header: { version: "2017071", messageId: "SYNTH-1" },
      medication: { description: "Amoxicillin 500 MG Oral Capsule" },
    });
    const reparsed = parseScript(msg.toString());
    expect(reparsed.warnings).toHaveLength(0);
    expect(reparsed.asNewRx()?.medication?.description).toBe("Amoxicillin 500 MG Oral Capsule");
  });

  it("builds a NewRx carrying parties that re-parses with zero warnings", () => {
    const msg = buildNewRx({
      header: { version: "2017071", messageId: "SYNTH-2", from: "PRESCRIBER", to: "PHARMACY" },
      patient: {
        name: { lastName: "Doe", firstName: "Jane" },
        gender: "F",
        dateOfBirth: "19800101",
      },
      pharmacy: { businessName: "Synthetic Pharmacy", identification: { ncpdpId: "1234567" } },
      prescriber: { name: { lastName: "Who" }, identification: { npi: "1700000000" } },
      medication: { description: "Lisinopril 10 MG Oral Tablet" },
    });
    expect(parseScript(msg.toString()).warnings).toHaveLength(0);
  });

  it("refuses a NewRx with no medication description", () => {
    expect(() => buildNewRx({ medication: { description: "  " } })).toThrowError(
      NcpdpScriptBuildError,
    );
    try {
      buildNewRx({ medication: {} });
    } catch (err) {
      expect((err as NcpdpScriptBuildError).code).toBe(SCRIPT_BUILD_CODES.MISSING_MEDICATION);
    }
  });

  it("refuses a value carrying an XML-illegal control character", () => {
    try {
      buildNewRx({ medication: { description: "Bad\x00Drug" } });
      throw new Error("expected a build error");
    } catch (err) {
      expect(err).toBeInstanceOf(NcpdpScriptBuildError);
      expect((err as NcpdpScriptBuildError).code).toBe(SCRIPT_BUILD_CODES.INVALID_CHARACTER);
    }
  });

  it("builds each response kind so it re-parses with the right disposition", () => {
    const status = buildScriptResponse({
      kind: "Status",
      code: "010",
      header: { version: "2017071", relatesToMessageId: "R1" },
    });
    expect(status.disposition).toBe("success");
    expect(parseScript(status.toString()).warnings).toHaveLength(0);

    const error = buildScriptResponse({
      kind: "Error",
      code: "900",
      description: "rejected",
      header: { version: "2017071" },
    });
    expect(error.disposition).toBe("error");
    expect(parseScript(error.toString()).asError()?.code).toBe("900");

    const verify = buildScriptResponse({
      kind: "Verify",
      code: "000",
      header: { version: "2017071" },
    });
    expect(verify.disposition).toBe("verify");
  });

  it("refuses a response with no code", () => {
    try {
      buildScriptResponse({ kind: "Status", code: "" });
      throw new Error("expected a build error");
    } catch (err) {
      expect(err).toBeInstanceOf(NcpdpScriptBuildError);
      expect((err as NcpdpScriptBuildError).code).toBe(SCRIPT_BUILD_CODES.MISSING_RESPONSE_CODE);
    }
  });
});

/**
 * Emit refuses a transaction this library does not model.
 *
 * The retired behaviour, for the record: a body of kind `unsupported` used to
 * serialize to a complete, re-parseable `<Message>` whose transaction was an
 * EMPTY element. Every child the transaction carried was gone, no warning and no
 * error said so, and an unrecognized element name was replaced by a fixed
 * placeholder tag (`<UnsupportedTransaction/>`), which made two different
 * unrecognized extensions emit as the same bytes. The placeholder is deleted
 * rather than replaced: a stabilised collision is the defect, not the remedy.
 */
describe("SCRIPT serializer: refuses a transaction this library does not model", () => {
  /** Sender-chosen element names and children, none of which may reach a diagnostic. */
  const VENDOR_ALPHA =
    '<Message version="2017071"><Body><SomeVendorExtension><Note>x</Note>' +
    "</SomeVendorExtension></Body></Message>";
  const VENDOR_BETA =
    '<Message version="2017071"><Body><AnotherVendorFlavour><Memo>y</Memo>' +
    "</AnotherVendorFlavour></Body></Message>";
  /** In the closed 42 CFR 423.160 vocabulary, so the parser names it, but not modeled. */
  const NAMED_UNMODELED =
    '<Message version="2017071"><Body><RxFill><RequestReferenceNumber>SYNTH-REF-0501' +
    "</RequestReferenceNumber></RxFill></Body></Message>";
  /** No `<Body>` and no recognized transaction at all. */
  const NO_BODY = "<Message/>";

  /**
   * Every publicly reachable emit route for one document: the exported function,
   * the message object's own string conversion, and the implicit coercion that
   * conversion rides on, where a caller wrote no call at all.
   */
  const ROUTES: readonly { name: string; emit: (raw: string) => string }[] = [
    { name: "serializeScript()", emit: (raw) => serializeScript(parseScript(raw)) },
    { name: "message.toString()", emit: (raw) => parseScript(raw).toString() },
    { name: "String() coercion", emit: (raw) => String(parseScript(raw)) },
    { name: "template-literal coercion", emit: (raw) => `${parseScript(raw).toString()}` },
  ];

  /** Run one route and return what it threw, failing if it returned a string instead. */
  function refusalFrom(raw: string, route: (input: string) => string): unknown {
    let returned: string | undefined;
    try {
      returned = route(raw);
    } catch (err) {
      return err;
    }
    throw new Error(`expected a refusal, but emit returned ${JSON.stringify(returned)}`);
  }

  it.each(ROUTES)("refuses an unnamed vendor extension through $name", ({ emit }) => {
    const err = refusalFrom(VENDOR_ALPHA, emit);
    expect(err).toBeInstanceOf(NcpdpScriptBuildError);
    expect((err as NcpdpScriptBuildError).code).toBe(SCRIPT_BUILD_CODES.UNSUPPORTED_TRANSACTION);
  });

  it("refuses a transaction that IS in the closed vocabulary but is not modeled", () => {
    const named = parseScript(NAMED_UNMODELED);
    expect(named.body.kind).toBe("unsupported");
    if (named.body.kind === "unsupported") expect(named.body.transaction).toBe("RxFill");
    for (const { emit } of ROUTES) {
      const err = refusalFrom(NAMED_UNMODELED, emit);
      expect(err).toBeInstanceOf(NcpdpScriptBuildError);
      // The SAME code as the unnamed case: whether the parser could name the
      // transaction changes nothing about what emit can honestly write.
      expect((err as NcpdpScriptBuildError).code).toBe(SCRIPT_BUILD_CODES.UNSUPPORTED_TRANSACTION);
    }
  });

  it("refuses every fixture the golden corpus can no longer round-trip", () => {
    const err = refusalFrom(loadScriptFixture("unsupported-transaction.xml"), (raw) =>
      serializeScript(parseScript(raw)),
    );
    expect((err as NcpdpScriptBuildError).code).toBe(SCRIPT_BUILD_CODES.UNSUPPORTED_TRANSACTION);
    // Whatever the partition sent here is refused, not quietly skipped.
    for (const name of refused) {
      const each = refusalFrom(loadScriptFixture(name), (raw) => serializeScript(parseScript(raw)));
      expect(each).toBeInstanceOf(NcpdpScriptBuildError);
    }
  });

  it("refuses a message with no <Body> and no recognized transaction, on the same path", () => {
    expect(parseScript(NO_BODY).body.kind).toBe("unsupported");
    const err = refusalFrom(NO_BODY, (raw) => serializeScript(parseScript(raw)));
    expect(err).toBeInstanceOf(NcpdpScriptBuildError);
    expect((err as NcpdpScriptBuildError).code).toBe(SCRIPT_BUILD_CODES.UNSUPPORTED_TRANSACTION);
  });

  it("emits no document for any pair of distinct unrecognized transactions", () => {
    // The collision this replaces: two different unrecognized transactions used
    // to produce the SAME bytes. Now neither produces bytes at all, so no such
    // pair exists. Collected as outcomes rather than asserted one at a time, so
    // the pairwise claim is what is actually checked.
    const emitted: string[] = [];
    const refusals: NcpdpScriptBuildError[] = [];
    for (const raw of [VENDOR_ALPHA, VENDOR_BETA, NAMED_UNMODELED, NO_BODY]) {
      try {
        emitted.push(serializeScript(parseScript(raw)));
      } catch (err) {
        expect(err).toBeInstanceOf(NcpdpScriptBuildError);
        refusals.push(err as NcpdpScriptBuildError);
      }
    }
    expect(emitted).toEqual([]);
    expect(refusals).toHaveLength(4);
    expect(new Set(refusals.map((e) => e.code))).toEqual(
      new Set([SCRIPT_BUILD_CODES.UNSUPPORTED_TRANSACTION]),
    );
  });

  it("emits no document anywhere carrying the retired placeholder element", () => {
    // The remedy is not a different fixed tag: nothing emit can still produce
    // carries the old one, and no unmodeled body produces anything at all.
    for (const name of emittable) {
      expect(serializeScript(parseScript(loadScriptFixture(name)))).not.toContain(
        "UnsupportedTransaction",
      );
    }
  });

  it("carries a stable code, distinct from the three published before it, on the public exports", () => {
    const code = SCRIPT_BUILD_CODES.UNSUPPORTED_TRANSACTION;
    expect(code).toBe("NCPDP_SCRIPT_BUILD_UNSUPPORTED_TRANSACTION");
    expect([
      SCRIPT_BUILD_CODES.MISSING_RESPONSE_CODE,
      SCRIPT_BUILD_CODES.MISSING_MEDICATION,
      SCRIPT_BUILD_CODES.INVALID_CHARACTER,
    ]).not.toContain(code);
    // Resolves to a fixed sentence in the frozen registry, which carries no
    // interpolation site: the message is the same string every time.
    expect(typeof SCRIPT_BUILD_MESSAGES[code]).toBe("string");
    expect(SCRIPT_BUILD_MESSAGES[code]).not.toMatch(/[$%{]/);
    expect(Object.isFrozen(SCRIPT_BUILD_MESSAGES)).toBe(true);
    // Reachable from the `common` subpath as well as the root entrypoint.
    expect(COMMON_SCRIPT_BUILD_CODES.UNSUPPORTED_TRANSACTION).toBe(code);
    expect(COMMON_SCRIPT_BUILD_MESSAGES[code]).toBe(SCRIPT_BUILD_MESSAGES[code]);
    expect(CommonNcpdpScriptBuildError).toBe(NcpdpScriptBuildError);
  });

  it("quotes nothing the sender chose, in the message, the own properties, or the stack", () => {
    const senderChosen = [
      "SomeVendorExtension",
      "AnotherVendorFlavour",
      "Memo",
      "RxFill",
      "SYNTH-REF-0501",
    ];
    for (const raw of [VENDOR_ALPHA, VENDOR_BETA, NAMED_UNMODELED]) {
      for (const { emit } of ROUTES) {
        const err = refusalFrom(raw, emit) as NcpdpScriptBuildError;
        // Byte-identical to the frozen registry entry: if that holds, no
        // interpolation happened, whatever the input carried.
        expect(err.message).toBe(SCRIPT_BUILD_MESSAGES[SCRIPT_BUILD_CODES.UNSUPPORTED_TRANSACTION]);
        // The own enumerable properties are the code and the name, and nothing else.
        expect(Object.keys(err).sort()).toEqual(["code", "name"]);
        const surfaces = [
          err.message,
          err.stack ?? "",
          JSON.stringify(Object.entries(err)),
          err.code,
          err.name,
        ];
        for (const surface of surfaces) {
          for (const marker of senderChosen) {
            expect(surface).not.toContain(marker);
          }
        }
      }
    }
  });
});
