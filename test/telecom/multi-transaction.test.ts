/**
 * Multi-transaction Telecom transmissions: every transaction a message carries is
 * decoded and reachable, on the request side and the response side alike.
 *
 * A pharmacy may bill several claims for one patient in a single transmission,
 * separated by the Group Separator. The whole point of these cases is that a
 * consumer is never handed the first claim as though it were the message: the
 * later transactions have a public read path, a malformed one costs only itself,
 * the declared Transaction Count is surfaced beside the number actually decoded,
 * and no maximum is enforced anywhere (no public artifact establishes one).
 *
 * Every value here is synthetic: no real BIN/PCN/NDC/cardholder.
 */

import { describe, expect, it } from "vitest";

import {
  parseTelecom,
  claim,
  adjudication,
  responseStatus,
  serializeTelecom,
  fieldValue,
  findSegment,
  tokenizeTransactions,
  NcpdpTelecomBuildError,
  TELECOM_BUILD_CODES,
  TELECOM_WARNING_CODES,
  TELECOM_WARNING_MESSAGES,
} from "../../src/telecom/index.js";
import {
  GS,
  buildTransmission,
  syntheticB1,
  syntheticMultiTransactionRequest,
  syntheticMultiTransactionRequestMalformedSecond,
  syntheticMultiTransactionResponse,
  syntheticNineTransactionRequest,
} from "../_helpers/build-telecom.js";

/** Two transactions with one segment each, over a header declaring `declared`. */
function twoTransactions(declared: string): string {
  return buildTransmission({ transactionCode: "B1", transactionCount: declared }, [
    [{ id: "07", fields: [["D2", "RX0000031"]] }],
    [{ id: "07", fields: [["D2", "RX0000032"]] }],
  ]);
}

describe("every group-separated transaction is exposed (request)", () => {
  it("decodes all three transactions with their own segments, in wire order", () => {
    const t = parseTelecom(syntheticMultiTransactionRequest());

    expect(t.transactions).toHaveLength(3);
    expect(t.transactions.map((tx) => tx.segments.length)).toEqual([2, 3, 1]);
    expect(t.transactions.map((tx) => tx.index)).toEqual([0, 1, 2]);
  });

  it("carries each transaction's field values verbatim, per transaction", () => {
    const t = parseTelecom(syntheticMultiTransactionRequest());
    const rxNumbers = t.transactions.map((tx) => fieldValue(findSegment(tx.segments, "07"), "D2"));

    expect(rxNumbers).toEqual(["RX0000011", "RX0000012", "RX0000013"]);
    expect(fieldValue(findSegment(t.transactions[1]?.segments ?? [], "07"), "D7")).toBe(
      "00093123457",
    );
    expect(fieldValue(findSegment(t.transactions[2]?.segments ?? [], "07"), "E7")).toBe("90000");
  });

  it("reaches every transaction without re-tokenizing the raw input", () => {
    // The public read path is the model: `transactions[n].segments` and the
    // views addressed by index. Nothing here touches the raw string.
    const t = parseTelecom(syntheticMultiTransactionRequest());

    expect(claim(t)?.prescriptionReferenceNumber).toBe("RX0000011");
    expect(claim(t, 1)?.prescriptionReferenceNumber).toBe("RX0000012");
    expect(claim(t, 2)?.prescriptionReferenceNumber).toBe("RX0000013");
    expect(claim(t, 1)?.dateOfBirth).toBe("19800101");
    expect(claim(t, 2)?.quantityDispensed?.impliedDecimal).toBe("90.000");
  });

  it("reads a transaction past the last one as absent rather than throwing", () => {
    const t = parseTelecom(syntheticMultiTransactionRequest());
    expect(claim(t, 3)).toBeUndefined();
    expect(claim(t, -1)).toBeUndefined();
  });

  it("carries each transaction's byte offset so a consumer can locate it", () => {
    const raw = syntheticMultiTransactionRequest();
    const t = parseTelecom(raw);
    const offsets = t.transactions.map((tx) => tx.byteOffset);

    expect(offsets[0]).toBe(56);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    // Each offset addresses that transaction's first byte in the raw message.
    for (const tx of t.transactions) {
      expect(raw.slice(tx.byteOffset, tx.byteOffset + 4)).toBe(`AM${tx.segments[0]?.segmentId}`);
    }
  });

  it("tokenizeTransactions exposes the same split without the fixed header", () => {
    const decoded = tokenizeTransactions(`AM07${GS}AM04`, 56);
    expect(decoded.map((tx) => tx.segments[0]?.segmentId)).toEqual(["07", "04"]);
  });
});

describe("every group-separated transaction is exposed (response)", () => {
  it("decodes each response transaction and its adjudication separately", () => {
    const t = parseTelecom(syntheticMultiTransactionResponse());

    expect(t.kind).toBe("response");
    expect(t.transactions).toHaveLength(3);
    expect(adjudication(t)?.status?.disposition).toBe("paid");
    expect(adjudication(t, 1)?.status?.disposition).toBe("rejected");
    expect(adjudication(t, 2)?.status?.disposition).toBe("paid");
    expect(responseStatus(t, 1)?.rejectCodes.map((r) => r.code)).toEqual(["70"]);
    expect(adjudication(t, 2)?.pricing?.patientPayAmount?.amount).toBe("5.00");
  });

  it("does not read a later transaction's answer as the first one's", () => {
    const t = parseTelecom(syntheticMultiTransactionResponse());
    expect(responseStatus(t)?.rejectCodes).toHaveLength(0);
    expect(adjudication(t, 3)).toBeUndefined();
  });
});

describe("a malformed later transaction is isolated", () => {
  it("still exposes three transactions, with one and three intact", () => {
    const t = parseTelecom(syntheticMultiTransactionRequestMalformedSecond());

    expect(t.transactions).toHaveLength(3);
    expect(fieldValue(findSegment(t.transactions[0]?.segments ?? [], "07"), "D2")).toBe(
      "RX0000011",
    );
    expect(fieldValue(findSegment(t.transactions[0]?.segments ?? [], "07"), "D7")).toBe(
      "00093123456",
    );
    expect(fieldValue(findSegment(t.transactions[2]?.segments ?? [], "07"), "D2")).toBe(
      "RX0000013",
    );
    expect(claim(t, 2)?.quantityDispensed?.source).toBe("90000");
  });

  it("attributes the malformation to the second transaction and nothing else", () => {
    const t = parseTelecom(syntheticMultiTransactionRequestMalformedSecond());

    expect(t.transactions[0]?.warnings).toHaveLength(0);
    expect(t.transactions[2]?.warnings).toHaveLength(0);
    expect(t.transactions[1]?.warnings.map((w) => w.code)).toEqual([
      TELECOM_WARNING_CODES.MALFORMED_FIELD,
      TELECOM_WARNING_CODES.MISSING_SEGMENT_ID,
    ]);
    // The same warnings appear on the transmission, and their byte offsets fall
    // inside the second transaction, so attribution holds on the flat list too.
    const second = t.transactions[1];
    const third = t.transactions[2];
    for (const w of t.transactions[1]?.warnings ?? []) {
      expect(t.warnings).toContain(w);
      expect(w.position.byteOffset).toBeGreaterThanOrEqual(second?.byteOffset ?? 0);
      expect(w.position.byteOffset).toBeLessThan(third?.byteOffset ?? 0);
    }
  });

  it("preserves the malformed transaction's own bytes rather than dropping it", () => {
    const t = parseTelecom(syntheticMultiTransactionRequestMalformedSecond());
    const second = t.transactions[1]?.segments[0];

    expect(second?.segmentId).toBe("");
    expect(second?.fields.map((f) => f.value)).toContain("RX0000012");
    expect(second?.fields.map((f) => f.value)).toContain("X");
  });

  it("does not throw: a malformed later transaction is recoverable input", () => {
    expect(() => parseTelecom(syntheticMultiTransactionRequestMalformedSecond())).not.toThrow();
  });
});

describe("the declared Transaction Count is reported beside the decoded number", () => {
  it("surfaces both as separate values, the declared one verbatim", () => {
    const t = parseTelecom(syntheticMultiTransactionRequest());

    expect(t.transactionCount).toBe("3");
    expect(t.decodedTransactionCount).toBe(3);
    expect(t.decodedTransactionCount).toBe(t.transactions.length);
    // The declared value stays a string: never coerced, never defaulted.
    expect(typeof t.transactionCount).toBe("string");
    expect(t.warnings.map((w) => w.code)).not.toContain(
      TELECOM_WARNING_CODES.TRANSACTION_COUNT_MISMATCH,
    );
  });

  it("reports both on the response side too", () => {
    const t = parseTelecom(syntheticMultiTransactionResponse());
    expect(t.transactionCount).toBe("3");
    expect(t.decodedTransactionCount).toBe(3);
  });

  it("warns when they disagree, and still exposes every decoded transaction", () => {
    const t = parseTelecom(twoTransactions("3"));

    expect(t.transactionCount).toBe("3");
    expect(t.decodedTransactionCount).toBe(2);
    expect(t.transactions).toHaveLength(2);
    expect(t.warnings.map((w) => w.code)).toContain(
      TELECOM_WARNING_CODES.TRANSACTION_COUNT_MISMATCH,
    );
    expect(claim(t, 1)?.prescriptionReferenceNumber).toBe("RX0000032");
  });

  it("points the mismatch warning at the Transaction Count field, carrying no wire bytes", () => {
    const t = parseTelecom(twoTransactions("3"));
    const w = t.warnings.find((x) => x.code === TELECOM_WARNING_CODES.TRANSACTION_COUNT_MISMATCH);

    expect(w?.position).toEqual({ byteOffset: 20, fieldId: "A9" });
    expect(w?.message).toBe(
      TELECOM_WARNING_MESSAGES[TELECOM_WARNING_CODES.TRANSACTION_COUNT_MISMATCH],
    );
    expect(w?.message).not.toContain("RX0000031");
    expect(w?.message).not.toContain("3");
  });
});

describe("no maximum transaction count is enforced", () => {
  it("decodes nine transactions, throwing nothing and asserting no maximum", () => {
    const t = parseTelecom(syntheticNineTransactionRequest());

    expect(t.transactions).toHaveLength(9);
    expect(t.transactionCount).toBe("9");
    expect(t.decodedTransactionCount).toBe(9);
    expect(t.warnings).toHaveLength(0);
    expect(claim(t, 8)?.prescriptionReferenceNumber).toBe("RX0000028");
  });

  it("has no warning or error whose meaning is that a count is illegal", () => {
    const t = parseTelecom(syntheticNineTransactionRequest());
    const codes: string[] = [
      ...Object.values(TELECOM_WARNING_CODES),
      ...Object.values(TELECOM_BUILD_CODES),
    ];

    expect(t.warnings).toHaveLength(0);
    expect(codes.filter((c) => /MAX|LIMIT|TOO_MANY/i.test(c))).toHaveLength(0);
    expect(TELECOM_WARNING_MESSAGES[TELECOM_WARNING_CODES.TRANSACTION_COUNT_MISMATCH]).toContain(
      "no maximum is enforced",
    );
  });
});

describe("a declared count that is not a count", () => {
  it.each([
    ["empty", ""],
    ["non-numeric", "X"],
    // 109-A9 is one byte wide on the D.0 wire, so a two-character declaration is
    // truncated by the FORMAT, not by this reader: the header slot carries "0",
    // which is what is surfaced verbatim. Re-framing a fixed-width header field
    // to capture the second byte would be an invented layout.
    ["a padded zero", "00"],
  ])("surfaces a %s declaration verbatim, warns, and never throws", (_label, declared) => {
    const raw = twoTransactions(declared);
    const t = parseTelecom(raw);

    expect(() => parseTelecom(raw)).not.toThrow();
    expect(t.transactions).toHaveLength(2);
    expect(t.decodedTransactionCount).toBe(2);
    expect(t.transactionCount).toBe(raw.slice(20, 21).trim());
    expect(t.warnings.map((w) => w.code)).toContain(
      TELECOM_WARNING_CODES.TRANSACTION_COUNT_MISMATCH,
    );
    expect(claim(t, 1)?.prescriptionReferenceNumber).toBe("RX0000032");
  });
});

describe("single-transaction and empty transmissions are unchanged", () => {
  it("carries one entry, no mismatch warning, and the same first-transaction segments", () => {
    const t = parseTelecom(syntheticB1());

    expect(t.transactions).toHaveLength(1);
    expect(t.decodedTransactionCount).toBe(1);
    expect(t.transactionCount).toBe("1");
    expect(t.transactions[0]?.segments).toBe(t.segments);
    expect(t.warnings).toHaveLength(0);
  });

  it("raises no mismatch for a body carrying no transaction at all", () => {
    const t = parseTelecom(buildTransmission({ transactionCode: "B1" }, []));

    expect(t.transactions).toHaveLength(0);
    expect(t.decodedTransactionCount).toBe(0);
    expect(t.transactionCount).toBe("1");
    expect(t.warnings).toHaveLength(0);
    expect(claim(t)).toBeUndefined();
  });
});

describe("the emit boundary refuses rather than dropping a transaction", () => {
  it("refuses to serialize a model carrying more than one decoded transaction", () => {
    const t = parseTelecom(syntheticMultiTransactionRequest());

    try {
      serializeTelecom(t);
      expect.unreachable("serializing a multi-transaction model must not succeed");
    } catch (err) {
      expect(err).toBeInstanceOf(NcpdpTelecomBuildError);
      expect((err as NcpdpTelecomBuildError).code).toBe(TELECOM_BUILD_CODES.MULTI_TRANSACTION_EMIT);
    }
  });

  it("refuses a multi-transaction response model the same way", () => {
    const t = parseTelecom(syntheticMultiTransactionResponse());
    expect(() => serializeTelecom(t)).toThrowError(
      expect.objectContaining({ code: TELECOM_BUILD_CODES.MULTI_TRANSACTION_EMIT }),
    );
  });

  it("still serializes a single-transaction model", () => {
    const wire = serializeTelecom(parseTelecom(syntheticB1()));
    expect(parseTelecom(wire).transactions).toHaveLength(1);
  });
});
