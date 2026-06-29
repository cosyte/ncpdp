import { describe, expect, it } from "vitest";

import { parseScript } from "../../src/index.js";
import { loadScriptFixture } from "../_helpers/load-fixture.js";

describe("namespace handling", () => {
  it("strips namespace prefixes from element names", () => {
    const raw = `<script:Message xmlns:script="urn:x" version="2017071">
      <script:Body>
        <script:NewRx>
          <script:MedicationPrescribed>
            <script:DrugDescription>Synthetic Drug 1 MG</script:DrugDescription>
          </script:MedicationPrescribed>
        </script:NewRx>
      </script:Body>
    </script:Message>`;
    const msg = parseScript(raw);
    expect(msg.asNewRx()?.medication?.description).toBe("Synthetic Drug 1 MG");
  });
});

describe("immutability", () => {
  it("freezes the parsed message and its warnings array", () => {
    const msg = parseScript(loadScriptFixture("newrx-coded-and-strength.xml"));
    expect(Object.isFrozen(msg)).toBe(true);
    expect(Object.isFrozen(msg.warnings)).toBe(true);
    expect(() => {
      (msg.warnings as unknown[]).push({ code: "X" });
    }).toThrow();
  });

  it("deeply freezes nested model objects", () => {
    const msg = parseScript(loadScriptFixture("newrx-basic.xml"));
    const med = msg.asNewRx()?.medication;
    expect(med).toBeDefined();
    expect(Object.isFrozen(med)).toBe(true);
    expect(Object.isFrozen(med?.coded)).toBe(true);
  });
});
