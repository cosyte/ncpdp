import { describe, expect, it } from "vitest";

import {
  parseScript,
  newRx,
  NcpdpScriptParseError,
  SCRIPT_FATAL_CODES,
  SCRIPT_WARNING_CODES,
} from "../../src/index.js";
import { loadScriptFixture } from "../_helpers/load-fixture.js";

describe("parseScript — fatal paths", () => {
  it("throws EMPTY_INPUT on empty / whitespace input", () => {
    for (const raw of ["", "   ", "\n\t"]) {
      expect(() => parseScript(raw)).toThrowError(NcpdpScriptParseError);
      try {
        parseScript(raw);
      } catch (err) {
        expect((err as NcpdpScriptParseError).code).toBe(SCRIPT_FATAL_CODES.EMPTY_INPUT);
      }
    }
  });

  it("throws NOT_XML on non-XML input", () => {
    try {
      parseScript("this is not xml at all");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as NcpdpScriptParseError).code).toBe(SCRIPT_FATAL_CODES.NOT_XML);
    }
  });

  it("refuses a DOCTYPE/ENTITY payload as NOT_XML (XXE boundary)", () => {
    const billionLaughs = `<?xml version="1.0"?>
      <!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]>
      <Message version="2017071"><Body><NewRx/></Body></Message>`;
    try {
      parseScript(billionLaughs);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as NcpdpScriptParseError).code).toBe(SCRIPT_FATAL_CODES.NOT_XML);
    }
  });

  it("throws NO_MESSAGE_ROOT when the root is not <Message>", () => {
    try {
      parseScript("<NotAMessage><Body/></NotAMessage>");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as NcpdpScriptParseError).code).toBe(SCRIPT_FATAL_CODES.NO_MESSAGE_ROOT);
    }
  });

  it("throws UNSUPPORTED_VERSION on a pre-XML legacy version", () => {
    try {
      parseScript(loadScriptFixture("legacy-version.xml"));
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as NcpdpScriptParseError).code).toBe(SCRIPT_FATAL_CODES.UNSUPPORTED_VERSION);
    }
  });
});

describe("parseScript — NewRx structural read", () => {
  it("extracts header, patient, pharmacy, prescriber, and medication", () => {
    const msg = parseScript(loadScriptFixture("newrx-basic.xml"));

    expect(msg.header.version).toBe("2017071");
    expect(msg.header.messageId).toBe("SYNTH-MSG-0001");
    expect(msg.header.to).toBe("SurescriptsTestPharmacy");
    expect(msg.header.sentTime).toBe("2026-01-15T09:30:00Z");
    expect(msg.warnings).toHaveLength(0);

    const rx = newRx(msg);
    expect(rx).toBeDefined();
    expect(rx?.patient?.name?.lastName).toBe("Testpatient");
    expect(rx?.patient?.name?.firstName).toBe("Avery");
    expect(rx?.patient?.gender).toBe("F");
    expect(rx?.patient?.dateOfBirth).toBe("1990-04-12");

    expect(rx?.pharmacy?.businessName).toBe("Synthetic Community Pharmacy");
    expect(rx?.pharmacy?.identification?.npi).toBe("1999999999");

    expect(rx?.prescriber?.name?.lastName).toBe("Testprescriber");
    expect(rx?.prescriber?.identification?.npi).toBe("1888888888");

    const med = rx?.medication;
    expect(med?.description).toBe("Amoxicillin 500 MG Oral Capsule");
    expect(med?.coded?.productCode?.value).toBe("00093310501");
    expect(med?.coded?.productCode?.system).toBe("NDC");
    expect(med?.quantity?.value?.source).toBe("30");
    expect(med?.quantity?.value?.isValid).toBe(true);
    expect(med?.quantity?.unitOfMeasure).toBe("C48480");
    expect(med?.daysSupply?.source).toBe("10");
    expect(med?.numberOfRefills).toBe("1");
    expect(med?.writtenDate).toBe("2026-01-15");
    expect(med?.sigText).toBe("Take 1 capsule by mouth three times daily for 10 days.");
  });

  it("surfaces both coded drug and explicit strength, never reconciling, and warns", () => {
    const msg = parseScript(loadScriptFixture("newrx-coded-and-strength.xml"));
    const med = newRx(msg)?.medication;

    expect(med?.coded?.productCode?.value).toBe("00185010201");
    expect(med?.coded?.drugDbCode?.value).toBe("314076");
    expect(med?.coded?.drugDbCode?.system).toBe("RXNORM");
    expect(med?.strength?.value).toBe("10");
    expect(med?.strength?.form).toBe("C42998");
    expect(med?.strength?.unitOfMeasure).toBe("C28253");
    expect(med?.directions).toBe("Take 1 tablet by mouth once daily.");

    const codes = msg.warnings.map((w) => w.code);
    expect(codes).toContain(SCRIPT_WARNING_CODES.STRENGTH_CODED_AND_EXPLICIT);
  });

  it("warns VERSION_ABSENT but still parses best-effort", () => {
    const msg = parseScript(loadScriptFixture("newrx-no-version.xml"));
    expect(msg.header.version).toBeUndefined();
    expect(msg.warnings.map((w) => w.code)).toContain(SCRIPT_WARNING_CODES.VERSION_ABSENT);
    expect(newRx(msg)?.medication?.description).toBe("Metformin 500 MG Oral Tablet");
  });

  it("warns UNSUPPORTED_VERSION_TOLERATED for an unknown 7-digit version", () => {
    const raw = '<Message version="2099001"><Body><NewRx/></Body></Message>';
    const msg = parseScript(raw);
    expect(msg.warnings.map((w) => w.code)).toContain(
      SCRIPT_WARNING_CODES.UNSUPPORTED_VERSION_TOLERATED,
    );
  });
});

describe("parseScript — vendor variant shapes", () => {
  it("tolerates alternate element shapes (own-text dates/codes, DrugDBCode attr, Refills/Value)", () => {
    const msg = parseScript(loadScriptFixture("newrx-variant-shapes.xml"));
    const rx = newRx(msg);

    expect(rx?.patient?.dateOfBirth).toBe("1980-01-01");
    expect(rx?.patient?.gender).toBe("U");
    expect(rx?.patient?.name?.firstName).toBeUndefined();
    expect(rx?.prescriber?.name?.lastName).toBe("Variantmd");
    expect(rx?.prescriber?.identification).toBeUndefined();

    const med = rx?.medication;
    expect(med?.coded?.productCode).toBeUndefined();
    expect(med?.coded?.drugDbCode?.value).toBe("387467008");
    expect(med?.coded?.drugDbCode?.system).toBe("SNOMED");
    expect(med?.strength).toBeUndefined();
    expect(med?.quantity?.unitOfMeasure).toBe("each");
    expect(med?.numberOfRefills).toBe("2");
    expect(med?.writtenDate).toBe("2026-03-01");

    // No coded+explicit-strength collision here, so no such warning.
    expect(msg.warnings.map((w) => w.code)).not.toContain(
      SCRIPT_WARNING_CODES.STRENGTH_CODED_AND_EXPLICIT,
    );
  });
});

describe("parseScript — empty-element edge cases", () => {
  it("treats empty elements as absent and reads DrugDBCode child Code/Qualifier", () => {
    const msg = parseScript(loadScriptFixture("newrx-edge-empties.xml"));
    const rx = newRx(msg);

    expect(rx?.patient?.gender).toBeUndefined();
    expect(rx?.patient?.dateOfBirth).toBeUndefined();
    expect(rx?.pharmacy?.businessName).toBeUndefined();
    // Pharmacy had only an empty BusinessName → the whole pharmacy collapses to undefined.
    expect(rx?.pharmacy).toBeUndefined();

    const med = rx?.medication;
    // Empty ProductCode is skipped; DrugDBCode resolves via its child elements.
    expect(med?.coded?.productCode).toBeUndefined();
    expect(med?.coded?.drugDbCode?.value).toBe("198440");
    expect(med?.coded?.drugDbCode?.system).toBe("RXNORM");
    expect(med?.quantity?.value?.source).toBe("20");
    expect(med?.quantity?.unitOfMeasure).toBeUndefined();
    expect(med?.writtenDate).toBeUndefined();
  });
});

describe("parseScript — non-NewRx transactions", () => {
  it("surfaces an unsupported transaction with a warning, not a throw", () => {
    const msg = parseScript(loadScriptFixture("rxrenewal-request.xml"));
    expect(msg.body.kind).toBe("unsupported");
    if (msg.body.kind === "unsupported") {
      expect(msg.body.transaction).toBe("RxRenewalRequest");
    }
    expect(newRx(msg)).toBeUndefined();
    expect(msg.warnings.map((w) => w.code)).toContain(SCRIPT_WARNING_CODES.UNSUPPORTED_TRANSACTION);
  });
});

describe("warnings carry XPath context, never field values (PHI-safe)", () => {
  it("every warning position is an XPath path with no patient data", () => {
    const msg = parseScript(loadScriptFixture("newrx-coded-and-strength.xml"));
    expect(msg.warnings.length).toBeGreaterThan(0);
    for (const w of msg.warnings) {
      expect(w.position.path.startsWith("/")).toBe(true);
      // No synthetic patient/drug values may appear in message or position.
      const haystack = `${w.message} ${w.position.path}`;
      expect(haystack).not.toContain("Sampleperson");
      expect(haystack).not.toContain("Lisinopril");
      expect(haystack).not.toContain("00185010201");
    }
  });
});
