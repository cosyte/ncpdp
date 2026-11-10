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

describe("processing instructions", () => {
  // XML 1.0 lets a processing instruction stand in the prolog before the root
  // element and anywhere inside it. It is an instruction to an application, not
  // an element, so it must never be read as the root or as a child.
  const body = `<Header><MessageID>SYNTH-MSG-PI</MessageID></Header>
    <Body><Status><Code>010</Code></Status></Body>`;

  it("reads the <Message> root when a processing instruction precedes it", () => {
    const raw = `<?xml version="1.0"?>
<?xml-stylesheet type="text/xsl" href="synthetic.xsl"?>
<Message version="2017071">${body}</Message>`;
    const msg = parseScript(raw);
    expect(msg.body.kind).toBe("Status");
    expect(msg.header.messageId).toBe("SYNTH-MSG-PI");
    expect(msg.warnings).toEqual([]);
  });

  it("names an unmodeled transaction when a processing instruction precedes it in <Body>", () => {
    const raw = `<Message version="2017071"><Body><?synthetic-pi note="x"?><RxFill/></Body></Message>`;
    const msg = parseScript(raw);
    expect(msg.body).toEqual({ kind: "unsupported", transaction: "RxFill" });
  });

  it("parses identically with or without processing instructions inside elements", () => {
    const plain = parseScript(loadScriptFixture("newrx-basic.xml"));
    const withPis = parseScript(
      loadScriptFixture("newrx-basic.xml")
        .replace("<Header>", "<?synthetic-pi a?><Header>")
        .replace("<DrugDescription>", "<?synthetic-pi b?><DrugDescription>"),
    );
    expect(withPis.body).toEqual(plain.body);
    expect(withPis.header).toEqual(plain.header);
    expect(withPis.warnings).toEqual(plain.warnings);
  });
});
