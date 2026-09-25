/**
 * Build a spec-clean Telecom B1 billing claim, serialize it, and read it back. The builder refuses a
 * claim that is invalid by construction, the serializer only ever writes spec-clean output, and
 * quantities are scaled string-wise with the verbatim source kept, never through a float.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/build-telecom-claim.ts
 *
 * Every value here is synthetic. The example checks its own output and exits non-zero on a
 * mismatch.
 */

import assert from "node:assert/strict";

import { buildTelecomRequest, claim, parseTelecom, serializeTelecom } from "@cosyte/ncpdp/telecom";

const wire = serializeTelecom(
  buildTelecomRequest({
    header: { transactionCode: "B1", binNumber: "999999", dateOfService: "20260115" },
    segments: [
      { segmentId: "04", fields: [{ id: "C2", value: "SYNTHCARD09" }] },
      {
        segmentId: "07",
        fields: [
          { id: "D2", value: "RX0000001" },
          { id: "E1", value: "03" },
          { id: "D7", value: "99999999999" },
          { id: "E7", value: "30000" },
          { id: "D5", value: "30" },
        ],
      },
    ],
  }),
);

const parsed = parseTelecom(wire);
const c = claim(parsed);
assert.ok(c, "a B1 request carries a claim");

console.log(
  "kind:",
  parsed.kind,
  "| transaction:",
  parsed.header.transactionCode,
  "| warnings:",
  parsed.warnings.length,
);
console.log("cardholder:", c.cardholderId, "| prescription:", c.prescriptionReferenceNumber);
console.log("product:", c.product?.id, "qualifier", c.product?.qualifier);
console.log(
  "quantity dispensed:",
  c.quantityDispensed?.source,
  "->",
  c.quantityDispensed?.impliedDecimal,
);

assert.equal(parsed.kind, "request");
assert.equal(parsed.header.transactionCode, "B1");
assert.equal(parsed.warnings.length, 0);
assert.equal(c.cardholderId, "SYNTHCARD09");
assert.equal(c.prescriptionReferenceNumber, "RX0000001");
assert.equal(c.product?.id, "99999999999");
assert.equal(c.product.qualifier, "03");
assert.equal(c.quantityDispensed?.source, "30000");
assert.equal(c.quantityDispensed.impliedDecimal, "30.000");

// Emit is canonical: serializing the parsed claim reproduces the same bytes.
const again = serializeTelecom(parsed);
console.log("re-serialized bytes identical:", again === wire);
assert.equal(again, wire);

console.log("build-telecom-claim: ok");
