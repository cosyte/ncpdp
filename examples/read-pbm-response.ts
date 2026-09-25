/**
 * Read a PBM's answer to a Telecom claim: paid or rejected, the reject codes verbatim, and every
 * DUR alert. A reject always wins, and an unrecognized code is kept with `known: false`, never
 * dropped.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/read-pbm-response.ts
 *
 * The inputs are the committed synthetic fixtures under `test/fixtures/telecom/`. The example
 * checks its own output and exits non-zero on a mismatch.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { adjudication, parseTelecom } from "@cosyte/ncpdp/telecom";

function fixture(name: string): string {
  return readFileSync(new URL(`../test/fixtures/telecom/${name}`, import.meta.url), "latin1");
}

// A paid claim that came back with one drug-drug interaction alert.
const paid = parseTelecom(fixture("pbm-response-dur.ncpdp"));
const paidOutcome = adjudication(paid); // undefined for a request transmission
const alert = paidOutcome?.dur?.[0];
console.log("kind:", paid.kind, "| disposition:", paidOutcome?.status?.disposition);
console.log(
  "DUR alerts:",
  paidOutcome?.dur?.length,
  "|",
  alert?.reasonForServiceCode,
  alert?.reasonDescription,
);

assert.equal(paid.kind, "response");
assert.equal(paidOutcome?.status?.disposition, "paid");
assert.deepEqual(paidOutcome.status.rejectCodes, []);
assert.equal(paidOutcome.dur?.length, 1);
assert.equal(alert?.reasonForServiceCode, "DD");
assert.equal(alert.reasonDescription, "Drug-Drug Interaction");

// A rejected claim whose reject code has no label: kept verbatim, flagged, and warned.
const rejected = parseTelecom(fixture("pbm-reject-unknown.ncpdp"));
const rejectedOutcome = adjudication(rejected);
const reject = rejectedOutcome?.status?.rejectCodes[0];
console.log(
  "disposition:",
  rejectedOutcome?.status?.disposition,
  "| reject:",
  reject?.code,
  "known:",
  reject?.known,
);
console.log("warnings:", rejected.warnings.map((w) => w.code).join(", "));

assert.equal(rejectedOutcome?.status?.disposition, "rejected");
assert.equal(reject?.code, "99");
assert.equal(reject.known, false);
assert.deepEqual(
  rejected.warnings.map((w) => w.code),
  ["NCPDP_TELECOM_UNKNOWN_REJECT_CODE"],
);

console.log("read-pbm-response: ok");
