/**
 * Telecom serializer + builder conformance.
 *
 *   - **Round-trip + idempotence** — every synthetic transmission, once parsed,
 *     serializes to a wire string that re-parses to the same canonical form, and
 *     serializing is idempotent. Equality is by canonical form (re-serialize),
 *     since a quirky input's exact padding/separators are normalized on emit.
 *   - **Builder** — refuses transactions invalid by construction with a typed
 *     {@link NcpdpTelecomBuildError}, and its output re-parses with zero warnings.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { roundTripProperty } from "@cosyte/test-utils";

import {
  parseTelecom,
  serializeTelecom,
  buildTelecomRequest,
  fieldValue,
  findSegment,
  NcpdpTelecomBuildError,
  TELECOM_BUILD_CODES,
  type TelecomTransaction,
} from "../../src/telecom/index.js";
import {
  FS,
  GS,
  RS,
  buildResponseTransmission,
  syntheticB1,
  syntheticCompoundClaim,
  syntheticSecondaryClaim,
} from "../_helpers/build-telecom.js";

const syntheticResponse = buildResponseTransmission({ transactionCode: "B1" }, [
  {
    id: "21",
    fields: [
      ["AN", "P"],
      ["F3", "AUTH123456"],
    ],
  },
  {
    id: "23",
    fields: [
      ["F5", "0001250"],
      ["F9", "0003750"],
    ],
  },
]);

const rawCorpus: ReadonlyArray<readonly [string, string]> = [
  ["B1 claim", syntheticB1()],
  ["compound claim", syntheticCompoundClaim()],
  ["secondary (COB) claim", syntheticSecondaryClaim()],
  ["B1 response", syntheticResponse],
];

describe("Telecom serializer — golden round-trip over the synthetic corpus", () => {
  it.each(rawCorpus)("round-trips the %s to a stable canonical form", (_label, raw) => {
    const original = parseTelecom(raw);
    const once = serializeTelecom(original);
    const reparsed = parseTelecom(once);
    const twice = serializeTelecom(reparsed);

    expect(twice).toBe(once);
    expect(serializeTelecom(reparsed)).toBe(serializeTelecom(original));
  });

  it("emits a request as the 56-byte header immediately followed by the framed body", () => {
    const wire = serializeTelecom(parseTelecom(syntheticB1()));
    expect(wire.slice(0, 56)).toHaveLength(56);
    expect(wire.slice(6, 8)).toBe("D0");
    expect(wire.slice(56).startsWith("AM")).toBe(true);
  });

  it("emits a response as the response header, a Group Separator, then the body", () => {
    const wire = serializeTelecom(parseTelecom(syntheticResponse));
    expect(wire.slice(0, 2)).toBe("D0");
    expect(wire).toContain(GS);
    expect(wire.indexOf(GS)).toBeLessThan(wire.indexOf("AM21"));
  });

  it("satisfies the round-trip + idempotence property over the corpus", () => {
    roundTripProperty<TelecomTransaction>({
      arbitrary: fc
        .constantFrom(...rawCorpus.map(([, raw]) => raw))
        .map((raw) => parseTelecom(raw)),
      serialize: (t) => serializeTelecom(t),
      parse: (raw) => parseTelecom(raw),
      equals: (a, b) => serializeTelecom(a) === serializeTelecom(b),
    });
  });
});

describe("Telecom builder — refuses invalid-by-construction transactions", () => {
  it("builds a B1 request that re-parses with zero warnings and preserves fields", () => {
    const t = buildTelecomRequest({
      header: { transactionCode: "B1", binNumber: "999999", serviceProviderId: "1234567890" },
      segments: [
        {
          segmentId: "07",
          fields: [
            { id: "D2", value: "RX0000001" },
            { id: "D7", value: "00093123456" },
            { id: "E7", value: "30000" },
          ],
        },
      ],
    });
    const reparsed = parseTelecom(serializeTelecom(t));
    expect(reparsed.warnings).toHaveLength(0);
    expect(reparsed.header.transactionCode).toBe("B1");
    expect(fieldValue(findSegment(reparsed.segments, "07"), "D7")).toBe("00093123456");
  });

  it("refuses a request with no transaction code", () => {
    expectBuildError(
      () => buildTelecomRequest({ header: { transactionCode: " " }, segments: [] }),
      TELECOM_BUILD_CODES.MISSING_TRANSACTION_CODE,
    );
  });

  it("refuses a segment with no segment id", () => {
    expectBuildError(
      () =>
        buildTelecomRequest({
          header: { transactionCode: "B1" },
          segments: [{ segmentId: "", fields: [] }],
        }),
      TELECOM_BUILD_CODES.MISSING_SEGMENT_ID,
    );
  });

  it("refuses a field with a non-2-character id", () => {
    expectBuildError(
      () =>
        buildTelecomRequest({
          header: { transactionCode: "B1" },
          segments: [{ segmentId: "07", fields: [{ id: "D", value: "x" }] }],
        }),
      TELECOM_BUILD_CODES.INVALID_FIELD_ID,
    );
  });

  it("refuses an embedded framing control character", () => {
    expectBuildError(
      () =>
        buildTelecomRequest({
          header: { transactionCode: "B1" },
          segments: [{ segmentId: "07", fields: [{ id: "D2", value: `RX${FS}1` }] }],
        }),
      TELECOM_BUILD_CODES.EMBEDDED_CONTROL_CHARACTER,
    );
  });

  it("refuses an over-long fixed-header field", () => {
    expectBuildError(
      () =>
        buildTelecomRequest({
          header: { transactionCode: "B1", binNumber: "12345678" },
          segments: [{ segmentId: "07", fields: [{ id: "D2", value: "RX1" }] }],
        }),
      TELECOM_BUILD_CODES.FIELD_TOO_LONG,
    );
  });

  it("refuses a control character in a segment id", () => {
    expectBuildError(
      () =>
        buildTelecomRequest({
          header: { transactionCode: "B1" },
          segments: [{ segmentId: `0${RS}7`, fields: [] }],
        }),
      TELECOM_BUILD_CODES.EMBEDDED_CONTROL_CHARACTER,
    );
  });
});

function expectBuildError(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error("expected a build error");
  } catch (err) {
    expect(err).toBeInstanceOf(NcpdpTelecomBuildError);
    expect((err as NcpdpTelecomBuildError).code).toBe(code);
  }
}
