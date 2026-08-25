/**
 * The absent-path contract for the structured SIG.
 *
 * A component whose element name this release cannot ground must not produce a
 * value at all. The failure mode this guards is not a missing field, it is a
 * CONFIDENT WRONG ONE: a name that matches the wrong element hands a consumer a
 * coded dose that reads as authoritative. So every slot is pinned to `absent`
 * when the only name the message used is one this release does not recognize,
 * and `absent` is pinned to mean absent: no code, no text, nothing inferred from
 * the free text.
 */

import { describe, expect, it } from "vitest";

import { parseScript, newRx, SCRIPT_WARNING_CODES, type StructuredSig } from "../../src/index.js";
import { SIG_COMPONENT_NAMES, SIG_COMPONENT_SLOTS } from "../../src/script/sig.js";
import { loadScriptFixture } from "../_helpers/load-fixture.js";

/** Parse a fixture and return the prescribed medication's structured SIG. */
function sigOf(fixture: string): { sig: StructuredSig | undefined; codes: string[] } {
  const msg = parseScript(loadScriptFixture(fixture));
  return { sig: newRx(msg)?.medication?.sig, codes: msg.warnings.map((w) => w.code) };
}

/**
 * The element name `newrx-sig-unrecognized-names.xml` uses for each slot, and
 * why that name is unrecognized. Every one of the ten names the previous
 * release carried and this one dropped appears here, so a name silently
 * reinstated in `SIG_COMPONENT_NAMES` turns this suite red.
 */
const UNRECOGNIZED_NAME_PER_SLOT: ReadonlyArray<
  readonly [(typeof SIG_COMPONENT_SLOTS)[number], string]
> = [
  ["doseDeliveryMethod", "DoseDeliveryMethodModifier"],
  ["dose", "Dose"],
  ["doseUnitOfMeasure", "DoseUnitOfMeasure"],
  ["route", "RouteOfAdministration"],
  ["siteOfAdministration", "SiteOfAdministration"],
  ["administrationTiming", "TimingAndDuration"],
  ["administrationTiming", "Frequency"],
  ["duration", "Duration"],
  ["vehicle", "Vehicle"],
  ["indication", "Indication"],
  ["maximumDoseRestriction", "MaximumDoseRestriction"],
];

describe("a component with no grounded element name decodes absent", () => {
  it("covers all ten component slots with an unrecognized name", () => {
    // The fixture is only evidence if it really reaches every slot.
    const covered = new Set(UNRECOGNIZED_NAME_PER_SLOT.map(([slot]) => slot));
    expect([...covered].sort()).toEqual([...SIG_COMPONENT_SLOTS].sort());
  });

  it("uses only names this release does not recognize", () => {
    const recognized = new Set(
      SIG_COMPONENT_SLOTS.flatMap((slot) => SIG_COMPONENT_NAMES[slot] as readonly string[]),
    );
    for (const [slot, name] of UNRECOGNIZED_NAME_PER_SLOT) {
      expect(recognized.has(name), `${name} is recognized, so it proves nothing for ${slot}`).toBe(
        false,
      );
    }
  });

  it.each(UNRECOGNIZED_NAME_PER_SLOT)(
    "reports %s absent when the message carried only <%s>",
    (slot, _name) => {
      const { sig } = sigOf("newrx-sig-unrecognized-names.xml");
      expect(sig).toBeDefined();
      if (sig === undefined) return;

      const field = sig[slot];
      expect(field.provenance).toBe("absent");
      // Absent means absent: neither half of the value survives.
      expect(field.code).toBeUndefined();
      expect(field.text).toBeUndefined();
    },
  );

  it("never infers an absent component from the free text that is sitting right there", () => {
    const { sig } = sigOf("newrx-sig-unrecognized-names.xml");
    expect(sig).toBeDefined();
    if (sig === undefined) return;

    // The <SigText> names a route, a timing and a duration in plain words, and
    // the unrecognized elements carry codes for them. Neither route reaches a
    // component.
    expect(sig.sigText).toBe("Take 1 tablet by mouth twice daily for 10 days for infection.");
    for (const slot of SIG_COMPONENT_SLOTS) {
      expect(sig[slot].provenance, `${slot} decoded from an unrecognized name`).toBe("absent");
    }
  });

  it("reports no structured data, and raises no lossy warning, when nothing decoded", () => {
    const { sig, codes } = sigOf("newrx-sig-unrecognized-names.xml");
    expect(sig?.hasStructuredData).toBe(false);
    expect(codes).not.toContain(SCRIPT_WARNING_CODES.SIG_STRUCTURED_LOSSY);
    // No element was matched as the dose quantity, so there is no ambiguity to
    // report either: the message simply carried nothing this release can read.
    expect(codes).not.toContain(SCRIPT_WARNING_CODES.SIG_AMBIGUOUS_DOSE);
  });

  it("still decodes the components whose names ARE grounded", () => {
    // The negative control for the suite above: the same shapes, under the
    // recognized names, do reach a consumer. Without this, every assertion
    // above would also pass on a decoder that returned absent unconditionally.
    const { sig, codes } = sigOf("newrx-sig-grounded-names.xml");
    expect(sig).toBeDefined();
    if (sig === undefined) return;

    expect(sig.doseDeliveryMethod.provenance).toBe("coded");
    expect(sig.dose).toEqual({ provenance: "derived", text: "1" });
    expect(sig.route.code?.value).toBe("26643006");
    expect(sig.siteOfAdministration.code?.value).toBe("123851003");
    expect(sig.administrationTiming).toEqual({ provenance: "derived", text: "twice daily" });
    expect(sig.hasStructuredData).toBe(true);
    expect(codes).toContain(SCRIPT_WARNING_CODES.SIG_STRUCTURED_LOSSY);
  });
});
