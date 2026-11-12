/**
 * Read a SCRIPT NewRx ePrescription and pull the fields a pharmacy system needs, in one line each.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/read-newrx.ts
 *
 * The input is the committed synthetic fixture `test/fixtures/script/newrx-quickstart.xml`. The
 * example checks its own output and exits non-zero on a mismatch.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { newRx, parseScript } from "@cosyte/ncpdp/script";

const xml = readFileSync(
  new URL("../test/fixtures/script/newrx-quickstart.xml", import.meta.url),
  "utf8",
);

const msg = parseScript(xml);
const rx = newRx(msg); // the NewRx body, or undefined for another transaction
assert.ok(rx, "the fixture is a NewRx");

// Each field is read into a variable and asserted below, never printed: a name, a drug, a product
// code and a sig can identify a person, and an example should not teach a reader to log them.
const patient = `${rx.patient?.name?.lastName ?? ""}, ${rx.patient?.name?.firstName ?? ""}`; // "DOE, AVERY", synthetic
const drug = rx.medication?.description; // "Amoxicillin 500 MG Oral Capsule", synthetic
const product = rx.medication?.coded?.productCode; // NDC "00000000001", synthetic
const quantity = rx.medication?.quantity?.value?.source; // "30", synthetic
const sig = rx.medication?.sig?.sigText; // "Take 1 capsule by mouth three times daily for 10 days.", synthetic

// What it prints is safe to log: a count, a code system and a length.
console.log("warnings:", msg.warnings.length);
console.log("product code system:", product?.system);
console.log("sig length:", sig?.length);

assert.equal(msg.header.messageId, "SYNTH-MSG-0001");
assert.equal(msg.warnings.length, 0);
assert.equal(patient, "DOE, AVERY");
assert.equal(drug, "Amoxicillin 500 MG Oral Capsule");
assert.equal(product?.system, "NDC");
assert.equal(product.value, "00000000001");
assert.equal(quantity, "30");
assert.equal(sig, "Take 1 capsule by mouth three times daily for 10 days.");

console.log("read-newrx: ok");
