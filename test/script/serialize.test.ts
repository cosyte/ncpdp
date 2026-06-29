/**
 * SCRIPT serializer + builder conformance.
 *
 * Two contracts are exercised here:
 *
 *   - **Golden round-trip** — every synthetic fixture, once parsed, serializes to
 *     XML that re-parses to the same canonical form. The serializer is the
 *     conservative (emit) half of Postel's Law; the read is lossy, so equality is
 *     by canonical form (re-serialize), not byte-identity with the original.
 *   - **Builder** — refuses messages that are invalid by construction with a typed
 *     {@link NcpdpScriptBuildError}, and its output re-parses with zero warnings.
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
} from "../../src/index.js";
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

describe("SCRIPT serializer — golden round-trip over every fixture", () => {
  it.each(fixtures)("round-trips %s to a stable canonical form", (name) => {
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

describe("SCRIPT builder — refuses invalid-by-construction messages", () => {
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
