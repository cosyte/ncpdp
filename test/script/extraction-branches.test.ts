import { describe, expect, it } from "vitest";

import { classifyVersion, parseScript, newRx } from "../../src/index.js";

describe("classifyVersion", () => {
  it("classifies known, tolerated, legacy, and absent versions", () => {
    expect(classifyVersion("2017071")).toEqual({
      kind: "known",
      version: "2017071",
    });
    expect(classifyVersion("2099001")).toEqual({
      kind: "tolerated",
      version: "2099001",
    });
    expect(classifyVersion("garbage")).toEqual({
      kind: "tolerated",
      version: "garbage",
    });
    expect(classifyVersion("10.6")).toEqual({
      kind: "unsupported",
      version: "10.6",
    });
    expect(classifyVersion(undefined)).toEqual({ kind: "absent" });
    expect(classifyVersion("   ")).toEqual({ kind: "absent" });
  });
});

describe("DrugDBCode fallback branches", () => {
  it("reads a bare DrugDBCode (own text, no qualifier → UNKNOWN system)", () => {
    const raw =
      '<Message version="2017071"><Body><NewRx><MedicationPrescribed>' +
      "<DrugCoded><DrugDBCode>198440</DrugDBCode></DrugCoded>" +
      "</MedicationPrescribed></NewRx></Body></Message>";
    const med = newRx(parseScript(raw))?.medication;
    expect(med?.coded?.drugDbCode?.value).toBe("198440");
    expect(med?.coded?.drugDbCode?.system).toBe("UNKNOWN");
  });

  it("skips an empty DrugDBCode", () => {
    const raw =
      '<Message version="2017071"><Body><NewRx><MedicationPrescribed>' +
      "<DrugCoded><DrugDBCode></DrugDBCode></DrugCoded>" +
      "</MedicationPrescribed></NewRx></Body></Message>";
    const med = newRx(parseScript(raw))?.medication;
    expect(med?.coded).toBeUndefined();
  });
});

describe("Body-less message fallback (NewRx directly under Message)", () => {
  it("finds a NewRx placed directly under <Message> with no <Body> wrapper", () => {
    const raw =
      '<Message version="2017071"><NewRx><MedicationPrescribed>' +
      "<DrugDescription>Synthetic 1 MG</DrugDescription>" +
      "</MedicationPrescribed></NewRx></Message>";
    const rx = newRx(parseScript(raw));
    expect(rx?.medication?.description).toBe("Synthetic 1 MG");
  });

  it("surfaces an unsupported transaction even with no <Body> wrapper", () => {
    const raw = '<Message version="2017071"><CancelRx/></Message>';
    const msg = parseScript(raw);
    expect(msg.body.kind).toBe("unsupported");
    if (msg.body.kind === "unsupported") {
      expect(msg.body.transaction).toBe("CancelRx");
    }
  });
});

describe("empty child-text and strength-form fallbacks", () => {
  it("treats an empty Substitutions and empty StrengthForm as absent", () => {
    const raw =
      '<Message version="2017071"><Body><NewRx><MedicationPrescribed>' +
      "<DrugDescription>Synthetic 1 MG</DrugDescription>" +
      "<Substitutions></Substitutions>" +
      "<Strength><StrengthValue>5</StrengthValue><StrengthForm></StrengthForm></Strength>" +
      "</MedicationPrescribed></NewRx></Body></Message>";
    const med = newRx(parseScript(raw))?.medication;
    expect(med?.substitutions).toBeUndefined();
    expect(med?.strength?.value).toBe("5");
    expect(med?.strength?.form).toBeUndefined();
  });
});
