/**
 * The claim view reads each segment once and each value where that pass found it. These hold it
 * to the rule it replaced, the first segment with each id and the first field with each id in it,
 * on transmissions that repeat every segment and every field it reads.
 */

import { describe, expect, it } from "vitest";

import {
  claim,
  claimView,
  fieldValue,
  findSegment,
  parseTelecom,
  type TelecomSegment,
} from "../../src/index.js";
import { buildTransmission, type SegmentParts } from "../_helpers/build-telecom.js";

/** Every field the claim view reads, by segment. */
const READS: Record<string, readonly string[]> = {
  "04": ["C1", "C2", "C3"],
  "01": ["C4", "C5"],
  "07": ["D2", "EM", "D3", "D8", "D7", "E1", "E7", "D5"],
  "03": ["DB", "EZ"],
};

/** A segment carrying every field it is read for twice, the values tagged by `tag`. */
function doubled(id: string, tag: string): SegmentParts {
  const ids = READS[id] ?? [];
  const fields: [string, string][] = [["ZZ", `${tag}-other`]];
  for (const fieldId of ids) fields.push([fieldId, `${tag}-${fieldId}-1`]);
  for (const fieldId of ids) fields.push([fieldId, `${tag}-${fieldId}-2`]);
  return { id, fields };
}

/** The view read the way it was before: the first segment, then the first field, per value. */
function naive(code: string, segments: readonly TelecomSegment[]): Record<string, unknown> {
  const out: Record<string, unknown> = { transactionCode: code };
  for (const [id, fieldIds] of Object.entries(READS)) {
    for (const fieldId of fieldIds) {
      out[`${id}:${fieldId}`] = fieldValue(findSegment(segments, id), fieldId);
    }
  }
  return out;
}

/** The same values read off a claim view. */
function viewed(view: ReturnType<typeof claimView>): Record<string, unknown> {
  return {
    transactionCode: view?.transactionCode,
    "04:C1": view?.groupId,
    "04:C2": view?.cardholderId,
    "04:C3": view?.personCode,
    "01:C4": view?.dateOfBirth,
    "01:C5": view?.genderCode,
    "07:D2": view?.prescriptionReferenceNumber,
    "07:EM": view?.prescriptionReferenceQualifier,
    "07:D3": view?.fillNumber,
    "07:D8": view?.dispenseAsWritten,
    "07:D7": view?.product?.id,
    "07:E1": view?.product?.qualifier,
    "07:E7": view?.quantityDispensed?.source,
    "07:D5": view?.daysSupply?.source,
    "03:DB": view?.prescriberId,
    "03:EZ": view?.prescriberIdQualifier,
  };
}

describe("the claim view reads each segment once", () => {
  const ids = Object.keys(READS);
  const raw = buildTransmission(
    { transactionCode: "B1" },
    [
      // Own segments repeated, in reverse order, behind an unread one.
      [
        { id: "11", fields: [["D7", "pricing"]] },
        ...ids.reverse().map((id) => doubled(id, "own")),
        ...ids.map((id) => doubled(id, "own2")),
      ],
      // A transaction with only a claim segment: the rest come from the shared level.
      [doubled("07", "second")],
    ],
    ids.map((id) => doubled(id, "shared")),
  );
  const t = parseTelecom(raw);

  it("takes the first segment and the first value, own before shared", () => {
    const own = [...(t.transactions[0]?.segments ?? []), ...t.transmissionSegments];
    expect(viewed(claim(t, 0))).toEqual(naive("B1", own));
    expect(claim(t, 0)?.groupId).toBe("own-C1-1");
    const second = [...(t.transactions[1]?.segments ?? []), ...t.transmissionSegments];
    expect(viewed(claim(t, 1))).toEqual(naive("B1", second));
    expect(claim(t, 1)?.groupId).toBe("shared-C1-1");
    expect(claim(t, 1)?.product?.id).toBe("second-D7-1");
  });

  it("reads a segment list the same way through claimView", () => {
    expect(viewed(claimView("B2", t.segments))).toEqual(naive("B2", t.segments));
  });

  it("reads a product from its qualifier alone, and nothing from segments that are not there", () => {
    const only = parseTelecom(buildTransmission({}, [[{ id: "07", fields: [["E1", "03"]] }]]));
    expect(claim(only)?.product).toEqual({ id: "", qualifier: "03" });
    const none = parseTelecom(buildTransmission({}, [[{ id: "11", fields: [["D7", "x"]] }]]));
    expect(claim(none)).toEqual({ transactionCode: "B1" });
    expect(claim(none, 3)).toBeUndefined();
  });
});
