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

const patient = `${rx.patient?.name?.lastName ?? ""}, ${rx.patient?.name?.firstName ?? ""}`;
const drug = rx.medication?.description;
const product = rx.medication?.coded?.productCode;
const quantity = rx.medication?.quantity?.value?.source;
const sig = rx.medication?.sig?.sigText;

console.log("message:", msg.header.messageId, "| warnings:", msg.warnings.length);
console.log("patient:", patient);
console.log("drug:", drug, "|", product?.system, product?.value);
console.log("quantity:", quantity);
console.log("sig:", sig);

assert.equal(msg.header.messageId, "SYNTH-MSG-0001");
assert.equal(msg.warnings.length, 0);
assert.equal(patient, "DOE, AVERY");
assert.equal(drug, "Amoxicillin 500 MG Oral Capsule");
assert.equal(product?.system, "NDC");
assert.equal(product.value, "00000000001");
assert.equal(quantity, "30");
assert.equal(sig, "Take 1 capsule by mouth three times daily for 10 days.");

console.log("read-newrx: ok");
