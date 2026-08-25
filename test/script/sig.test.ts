import { describe, expect, it } from "vitest";

import {
  parseScript,
  newRx,
  SCRIPT_WARNING_CODES,
  type SigField,
  type SigFieldProvenance,
  type StructuredSig,
} from "../../src/index.js";
import { loadScriptFixture } from "../_helpers/load-fixture.js";

/** Parse a fixture and return the prescribed medication's structured SIG. */
function sigOf(fixture: string): { sig: StructuredSig | undefined; codes: string[] } {
  const msg = parseScript(loadScriptFixture(fixture));
  const sig = newRx(msg)?.medication?.sig;
  return { sig, codes: msg.warnings.map((w) => w.code) };
}

const ALL_FIELDS: readonly (keyof StructuredSig)[] = [
  "doseDeliveryMethod",
  "dose",
  "doseUnitOfMeasure",
  "route",
  "siteOfAdministration",
  "administrationTiming",
  "duration",
  "vehicle",
  "indication",
  "maximumDoseRestriction",
];

describe("structured SIG decode", () => {
  it("decodes a full structured SIG with coded method provenance, and drops the ungrounded names", () => {
    // This fixture predates the grounding pass and still uses the element names
    // the previous release recognized. It is kept exactly as it was, because
    // that makes it the honest demonstration of what the narrowing costs: the
    // components whose names survived still decode, and the ones whose names
    // were removed now read absent even though the message plainly carried
    // them.
    const { sig, codes } = sigOf("newrx-structured-sig.xml");
    expect(sig).toBeDefined();
    if (sig === undefined) return;

    // Free text is preserved verbatim: the source of truth, untouched by any of
    // this.
    expect(sig.sigText).toBe("Take 1 tablet by mouth twice daily for 10 days for infection.");
    expect(sig.hasStructuredData).toBe(true);

    // Grounded names still decode. The delivery method carries SNOMED provenance.
    expect(sig.doseDeliveryMethod.provenance).toBe("coded");
    expect(sig.doseDeliveryMethod.code?.system).toBe("SNOMED");

    // Dose quantity is derived (uncoded numeric), never invented.
    expect(sig.dose.provenance).toBe("derived");
    expect(sig.dose.text).toBe("1");

    // Uncoded structure under a grounded name is "derived".
    expect(sig.administrationTiming).toEqual({ provenance: "derived", text: "twice daily" });

    // Removed names no longer match. <RouteOfAdministration>, <SiteOfAdministration>,
    // <DoseUnitOfMeasure>, <Duration> and <Indication> are all present in this
    // message, carrying codes, and none of them reaches a consumer.
    for (const slot of [
      "route",
      "siteOfAdministration",
      "doseUnitOfMeasure",
      "duration",
      "indication",
    ] as const) {
      expect(sig[slot].provenance, `${slot} decoded from a removed name`).toBe("absent");
      expect(sig[slot].code).toBeUndefined();
      expect(sig[slot].text).toBeUndefined();
    }

    // Components the message never carried stay absent too.
    expect(sig.vehicle.provenance).toBe("absent");
    expect(sig.maximumDoseRestriction.provenance).toBe("absent");

    // The lossy decode is flagged once; no ambiguity here.
    expect(codes).toContain(SCRIPT_WARNING_CODES.SIG_STRUCTURED_LOSSY);
    expect(codes).not.toContain(SCRIPT_WARNING_CODES.SIG_AMBIGUOUS_DOSE);
    expect(codes.filter((c) => c === SCRIPT_WARNING_CODES.SIG_STRUCTURED_LOSSY)).toHaveLength(1);
  });

  it("never emits a confident dose from an ambiguous structured SIG", () => {
    const { sig, codes } = sigOf("newrx-sig-ambiguous-dose.xml");
    expect(sig).toBeDefined();
    if (sig === undefined) return;

    // <DoseQuantity> IS a recognized name and IS present, so the dose was
    // matched; it just carried no quantity → absent, not guessed, and warned.
    expect(sig.dose.provenance).toBe("absent");
    expect(sig.dose.text).toBeUndefined();
    expect(sig.dose.code).toBeUndefined();
    expect(codes).toContain(SCRIPT_WARNING_CODES.SIG_AMBIGUOUS_DOSE);

    // Other unambiguous components still decode.
    expect(sig.route.provenance).toBe("coded");
    expect(sig.route.code?.value).toBe("6064005");

    // The unit of measure sits right beside the empty dose, spelled with the
    // name the previous release recognized. It has no grounded name now, so it
    // reads absent rather than lending the ambiguous dose a unit.
    expect(sig.doseUnitOfMeasure.provenance).toBe("absent");
    expect(sig.doseUnitOfMeasure.text).toBeUndefined();

    // Free text intact.
    expect(sig.sigText).toBe("Apply topically to the affected area as directed.");
  });

  it("surfaces both structured and free-text values when they disagree, never reconciling", () => {
    const { sig } = sigOf("newrx-sig-disagreement.xml");
    expect(sig).toBeDefined();
    if (sig === undefined) return;

    // Free text says "2 tablets ... at bedtime".
    expect(sig.sigText).toBe("Take 2 tablets by mouth at bedtime.");
    // Structured view says dose "1" and timing "every morning": surfaced as-is.
    expect(sig.dose.text).toBe("1");
    expect(sig.administrationTiming.text).toBe("every morning");
    // The library does not collapse the disagreement into one answer.
  });

  it("decodes a text-only SIG with no structured data and no lossy warning", () => {
    const { sig, codes } = sigOf("newrx-sig-text-only.xml");
    expect(sig).toBeDefined();
    if (sig === undefined) return;

    expect(sig.sigText).toBe("Inhale 2 puffs by mouth every 4 to 6 hours as needed.");
    expect(sig.hasStructuredData).toBe(false);
    for (const field of ALL_FIELDS) {
      expect((sig[field] as SigField).provenance).toBe("absent");
    }
    expect(codes).not.toContain(SCRIPT_WARNING_CODES.SIG_STRUCTURED_LOSSY);
    expect(codes).not.toContain(SCRIPT_WARNING_CODES.SIG_AMBIGUOUS_DOSE);
  });

  it("every structured field is always tagged coded | derived | absent", () => {
    for (const fixture of [
      "newrx-structured-sig.xml",
      "newrx-sig-ambiguous-dose.xml",
      "newrx-sig-disagreement.xml",
      "newrx-sig-text-only.xml",
      "newrx-sig-grounded-names.xml",
      "newrx-sig-unrecognized-names.xml",
    ]) {
      const { sig } = sigOf(fixture);
      expect(sig).toBeDefined();
      if (sig === undefined) continue;
      for (const field of ALL_FIELDS) {
        expect(["coded", "derived", "absent"]).toContain((sig[field] as SigField).provenance);
      }
    }
  });

  it("treats a Sig that carries only SigText as structureless (regression on NewRx basic)", () => {
    const { sig, codes } = sigOf("newrx-basic.xml");
    expect(sig).toBeDefined();
    expect(sig?.hasStructuredData).toBe(false);
    expect(sig?.sigText).toBe("Take 1 capsule by mouth three times daily for 10 days.");
    expect(codes).not.toContain(SCRIPT_WARNING_CODES.SIG_STRUCTURED_LOSSY);
  });

  it("leaves sig undefined when the medication carries no <Sig>", () => {
    const med = newRx(parseScript(loadScriptFixture("newrx-variant-shapes.xml")))?.medication;
    expect(med).toBeDefined();
    expect(med?.sig).toBeUndefined();
  });

  it("freezes the structured SIG against mutation", () => {
    const { sig } = sigOf("newrx-structured-sig.xml");
    expect(sig).toBeDefined();
    if (sig === undefined) return;
    expect(Object.isFrozen(sig)).toBe(true);
    expect(Object.isFrozen(sig.route)).toBe(true);
  });

  it("keeps every component slot and both SIG warning codes exported", () => {
    // Narrowing the recognized names must not narrow the SURFACE. A consumer
    // still sees all ten slots (five of which can now only ever be absent) and
    // both warning codes, so nothing downstream fails to compile and nothing
    // has to guess whether a slot went away or merely stopped decoding.
    const { sig } = sigOf("newrx-sig-text-only.xml");
    expect(sig).toBeDefined();
    if (sig === undefined) return;
    for (const field of ALL_FIELDS) {
      expect(sig, `${String(field)} is no longer on StructuredSig`).toHaveProperty(String(field));
    }
    expect(Object.keys(SCRIPT_WARNING_CODES)).toContain("SIG_STRUCTURED_LOSSY");
    expect(Object.keys(SCRIPT_WARNING_CODES)).toContain("SIG_AMBIGUOUS_DOSE");
    expect(SCRIPT_WARNING_CODES.SIG_STRUCTURED_LOSSY).toBe("NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY");
    expect(SCRIPT_WARNING_CODES.SIG_AMBIGUOUS_DOSE).toBe("NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE");

    // The provenance union is still exported: this line is the assertion, and
    // it fails at compile time if the type goes away.
    const provenance: SigFieldProvenance = "absent";
    expect(["coded", "derived", "absent"]).toContain(provenance);
  });
});
