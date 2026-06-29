import { describe, expect, it } from "vitest";

import {
  parseScript,
  newRx,
  SCRIPT_WARNING_CODES,
  type SigField,
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
  it("decodes a full structured SIG with coded route/site/method provenance", () => {
    const { sig, codes } = sigOf("newrx-structured-sig.xml");
    expect(sig).toBeDefined();
    if (sig === undefined) return;

    // Free text is preserved verbatim — the source of truth.
    expect(sig.sigText).toBe("Take 1 tablet by mouth twice daily for 10 days for infection.");
    expect(sig.hasStructuredData).toBe(true);

    // Route + site carry SNOMED provenance; method too.
    expect(sig.route.provenance).toBe("coded");
    expect(sig.route.code?.value).toBe("26643006");
    expect(sig.route.code?.system).toBe("SNOMED");
    expect(sig.route.text).toBe("by mouth");

    expect(sig.siteOfAdministration.provenance).toBe("coded");
    expect(sig.siteOfAdministration.code?.system).toBe("SNOMED");

    expect(sig.doseDeliveryMethod.provenance).toBe("coded");
    expect(sig.doseDeliveryMethod.code?.system).toBe("SNOMED");

    // Unit of measure is NCI-coded.
    expect(sig.doseUnitOfMeasure.provenance).toBe("coded");
    expect(sig.doseUnitOfMeasure.code?.system).toBe("NCI");

    // Dose quantity is derived (uncoded numeric), never invented.
    expect(sig.dose.provenance).toBe("derived");
    expect(sig.dose.text).toBe("1");

    // Uncoded structure is "derived".
    expect(sig.administrationTiming).toEqual({ provenance: "derived", text: "twice daily" });
    expect(sig.duration).toEqual({ provenance: "derived", text: "10 days" });
    expect(sig.indication).toEqual({ provenance: "derived", text: "for infection" });

    // Absent components stay absent (not inferred from the free text).
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

    // The dose container was present but carried no quantity → absent, not guessed.
    expect(sig.dose.provenance).toBe("absent");
    expect(sig.dose.text).toBeUndefined();
    expect(codes).toContain(SCRIPT_WARNING_CODES.SIG_AMBIGUOUS_DOSE);

    // Other unambiguous components still decode.
    expect(sig.route.provenance).toBe("coded");
    expect(sig.route.code?.value).toBe("6064005");
    expect(sig.doseUnitOfMeasure.provenance).toBe("derived");
    expect(sig.doseUnitOfMeasure.text).toBe("application");

    // Free text intact.
    expect(sig.sigText).toBe("Apply topically to the affected area as directed.");
  });

  it("surfaces both structured and free-text values when they disagree, never reconciling", () => {
    const { sig } = sigOf("newrx-sig-disagreement.xml");
    expect(sig).toBeDefined();
    if (sig === undefined) return;

    // Free text says "2 tablets ... at bedtime".
    expect(sig.sigText).toBe("Take 2 tablets by mouth at bedtime.");
    // Structured view says dose "1" and timing "every morning" — surfaced as-is.
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
});
