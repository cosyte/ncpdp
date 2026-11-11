/**
 * Transmission-level segments are not a transaction.
 *
 * In a Telecom D.0 transmission the segments that come before the first Group Separator, such as
 * Patient and Insurance on a request, belong to the transmission and are shared by every
 * transaction in it; each transaction is introduced by its own Group Separator. These cases hold
 * the reader to that shape: the leading part is surfaced on `transmissionSegments`, it is never
 * counted as a transaction, every claim view reads it beside its own transaction's segments, and
 * the serializer writes it back in front of the Group Separator.
 *
 * Every value here is synthetic: no real BIN/PCN/NDC/cardholder.
 */

import { describe, expect, it } from "vitest";

import {
  parseTelecom,
  claim,
  adjudication,
  serializeTelecom,
  tokenizeBody,
  tokenizeTransactions,
  tokenizeTransmission,
  TELECOM_WARNING_CODES,
  type NcpdpTelecomWarning,
} from "../../src/telecom/index.js";
import {
  FS,
  GS,
  RS,
  buildHeader,
  buildResponseHeader,
  buildSegment,
} from "../_helpers/build-telecom.js";

const INSURANCE = buildSegment({
  id: "04",
  fields: [
    ["C2", "SYNTHCARD41"],
    ["C1", "GRP410"],
  ],
});
const PATIENT = buildSegment({
  id: "01",
  fields: [
    ["C4", "19700401"],
    ["C5", "2"],
  ],
});
const CLAIM_ONE = buildSegment({
  id: "07",
  fields: [
    ["D2", "RX0000041"],
    ["D7", "00093100041"],
    ["E7", "30000"],
  ],
});
const CLAIM_TWO = buildSegment({
  id: "07",
  fields: [
    ["D2", "RX0000042"],
    ["D7", "00093100042"],
  ],
});
const PRESCRIBER = buildSegment({
  id: "03",
  fields: [
    ["EZ", "01"],
    ["DB", "1700000041"],
  ],
});

/** Insurance and Patient at transmission level, then one transaction: Claim and Prescriber. */
function oneClaim(declared = "1"): string {
  return (
    buildHeader({ transactionCode: "B1", transactionCount: declared }) +
    [INSURANCE, PATIENT].join(RS) +
    GS +
    [CLAIM_ONE, PRESCRIBER].join(RS)
  );
}

/** The same transmission-level segments shared by two transactions. */
function twoClaims(): string {
  return (
    buildHeader({ transactionCode: "B1", transactionCount: "2" }) +
    [INSURANCE, PATIENT].join(RS) +
    GS +
    [CLAIM_ONE, PRESCRIBER].join(RS) +
    GS +
    CLAIM_TWO
  );
}

const ids = (segments: readonly { readonly segmentId: string }[]): string[] =>
  segments.map((s) => s.segmentId);
const codes = (warnings: readonly NcpdpTelecomWarning[]): string[] => warnings.map((w) => w.code);

describe("segments before the first Group Separator (request)", () => {
  it("decodes one transaction, with no count mismatch, when Insurance and Patient lead", () => {
    const t = parseTelecom(oneClaim());

    expect(t.transactions).toHaveLength(1);
    expect(t.decodedTransactionCount).toBe(1);
    expect(codes(t.warnings)).not.toContain(TELECOM_WARNING_CODES.TRANSACTION_COUNT_MISMATCH);
    expect(t.warnings).toHaveLength(0);
  });

  it("surfaces the leading segments on transmissionSegments and keeps them out of the transaction", () => {
    const t = parseTelecom(oneClaim());

    expect(ids(t.transmissionSegments)).toEqual(["04", "01"]);
    expect(ids(t.transactions[0]?.segments ?? [])).toEqual(["07", "03"]);
    expect(t.transactions[0]?.index).toBe(0);
    expect(t.transactions[0]?.byteOffset).toBe(oneClaim().indexOf(GS) + 1);
  });

  it("keeps segments as every segment of the first transaction's view, in wire order", () => {
    const t = parseTelecom(oneClaim());
    expect(ids(t.segments)).toEqual(["04", "01", "07", "03"]);
  });

  it("gives the claim view the shared Patient and Insurance beside its own Claim", () => {
    const view = claim(parseTelecom(oneClaim()));

    expect(view?.dateOfBirth).toBe("19700401");
    expect(view?.cardholderId).toBe("SYNTHCARD41");
    expect(view?.groupId).toBe("GRP410");
    expect(view?.prescriptionReferenceNumber).toBe("RX0000041");
    expect(view?.product?.id).toBe("00093100041");
    expect(view?.prescriberId).toBe("1700000041");
  });

  it("shares the transmission-level segments with every transaction of a multi-claim message", () => {
    const t = parseTelecom(twoClaims());

    expect(t.transactions).toHaveLength(2);
    expect(t.warnings).toHaveLength(0);
    expect(claim(t)?.prescriptionReferenceNumber).toBe("RX0000041");
    expect(claim(t, 1)?.prescriptionReferenceNumber).toBe("RX0000042");
    expect(claim(t)?.dateOfBirth).toBe("19700401");
    expect(claim(t, 1)?.dateOfBirth).toBe("19700401");
    expect(claim(t, 1)?.cardholderId).toBe("SYNTHCARD41");
    // The second transaction carries no Prescriber, and does not borrow the first one's.
    expect(claim(t, 1)?.prescriberId).toBeUndefined();
    expect(claim(t, 2)).toBeUndefined();
  });

  it("lets a transaction's own segment win over a transmission-level one with the same id", () => {
    const ownPatient = buildSegment({ id: "01", fields: [["C4", "19900909"]] });
    const raw =
      buildHeader({ transactionCode: "B1" }) +
      [INSURANCE, PATIENT].join(RS) +
      GS +
      [CLAIM_ONE, ownPatient].join(RS);
    const view = claim(parseTelecom(raw));

    expect(view?.dateOfBirth).toBe("19900909");
    expect(view?.cardholderId).toBe("SYNTHCARD41");
  });

  it("reads a body with a leading Group Separator as one transaction and no transmission segments", () => {
    const t = parseTelecom(buildHeader({ transactionCode: "B1" }) + GS + CLAIM_ONE);

    expect(t.transmissionSegments).toHaveLength(0);
    expect(t.transactions).toHaveLength(1);
    expect(claim(t)?.prescriptionReferenceNumber).toBe("RX0000041");
  });

  it("reads a body with no Group Separator at all as one transaction, as before", () => {
    const t = parseTelecom(
      buildHeader({ transactionCode: "B1" }) + [INSURANCE, PATIENT, CLAIM_ONE].join(RS),
    );

    expect(t.transmissionSegments).toHaveLength(0);
    expect(t.transactions).toHaveLength(1);
    expect(ids(t.segments)).toEqual(["04", "01", "07"]);
    expect(claim(t)?.dateOfBirth).toBe("19700401");
  });

  it("warns a count mismatch when transmission-level segments carry no transaction behind them", () => {
    const t = parseTelecom(
      buildHeader({ transactionCode: "B1" }) + [INSURANCE, PATIENT].join(RS) + GS,
    );

    expect(t.transactions).toHaveLength(0);
    expect(t.decodedTransactionCount).toBe(0);
    expect(ids(t.transmissionSegments)).toEqual(["04", "01"]);
    expect(ids(t.segments)).toEqual(["04", "01"]);
    expect(codes(t.warnings)).toEqual([TELECOM_WARNING_CODES.TRANSACTION_COUNT_MISMATCH]);
    expect(claim(t)).toBeUndefined();
  });

  it("raises a transmission-level warning on the transmission, never on a transaction", () => {
    const raw =
      buildHeader({ transactionCode: "B1" }) + ["C2SYNTHCARD41", "X"].join(FS) + GS + CLAIM_ONE;
    const t = parseTelecom(raw);

    expect(t.transactions).toHaveLength(1);
    expect(t.transactions[0]?.warnings).toHaveLength(0);
    expect(codes(t.warnings)).toEqual([
      TELECOM_WARNING_CODES.MALFORMED_FIELD,
      TELECOM_WARNING_CODES.MISSING_SEGMENT_ID,
    ]);
  });
});

/**
 * A sender that writes its first transaction with no Group Separator in front of it, then a second
 * one with a Group Separator (and a Segment Separator) in front of it, declaring two. The framing
 * puts a Group Separator in front of every transaction, so the first group sits where the
 * transmission level goes: it is read as transmission-level segments, kept verbatim, and the declared
 * count disagrees with the one transaction the framing introduces. Versions before the
 * transmission-level fix read that first group as a transaction and decoded two.
 */
describe("a first transaction written without its Group Separator", () => {
  /** Patient, Prescriber, Insurance and the first Claim with no Group Separator, then a second. */
  function firstWithoutGroupSeparator(): string {
    return (
      buildHeader({ transactionCode: "B1", transactionCount: "2" }) +
      [PATIENT, PRESCRIBER, INSURANCE, CLAIM_ONE].join(RS) +
      GS +
      RS +
      CLAIM_TWO
    );
  }

  /** The same segments with a Group Separator in front of each transaction, as the framing has it. */
  function bothWithGroupSeparators(): string {
    return (
      buildHeader({ transactionCode: "B1", transactionCount: "2" }) +
      GS +
      [PATIENT, PRESCRIBER, INSURANCE, CLAIM_ONE].join(RS) +
      GS +
      RS +
      CLAIM_TWO
    );
  }

  it("decodes one transaction against a declared two, and warns the mismatch", () => {
    const t = parseTelecom(firstWithoutGroupSeparator());

    expect(t.transactionCount).toBe("2");
    expect(t.decodedTransactionCount).toBe(1);
    expect(t.transactions).toHaveLength(1);
    expect(codes(t.warnings)).toEqual([TELECOM_WARNING_CODES.TRANSACTION_COUNT_MISMATCH]);
  });

  it("keeps the first group verbatim on transmissionSegments and drops no segment", () => {
    const t = parseTelecom(firstWithoutGroupSeparator());

    expect(ids(t.transmissionSegments)).toEqual(["01", "03", "04", "07"]);
    expect(ids(t.transactions[0]?.segments ?? [])).toEqual(["07"]);
    expect(ids(t.segments)).toEqual(["01", "03", "04", "07", "07"]);
    // The transaction's own Claim wins over the one in the first group.
    expect(claim(t)?.prescriptionReferenceNumber).toBe("RX0000042");
    expect(claim(t, 1)).toBeUndefined();
  });

  it("writes every segment back, and the result re-reads the same way", () => {
    const wire = serializeTelecom(parseTelecom(firstWithoutGroupSeparator()));
    const again = parseTelecom(wire);

    expect(wire).toContain("RX0000041");
    expect(wire).toContain("RX0000042");
    expect(ids(again.transmissionSegments)).toEqual(["01", "03", "04", "07"]);
    expect(again.decodedTransactionCount).toBe(1);
  });

  it("decodes two, with no warning, when each transaction has its Group Separator", () => {
    const t = parseTelecom(bothWithGroupSeparators());

    expect(t.decodedTransactionCount).toBe(2);
    expect(t.transmissionSegments).toHaveLength(0);
    expect(t.warnings).toHaveLength(0);
    expect(claim(t)?.prescriptionReferenceNumber).toBe("RX0000041");
    expect(claim(t, 1)?.prescriptionReferenceNumber).toBe("RX0000042");
  });
});

describe("segments before the first Group Separator (response)", () => {
  it("decodes one transaction when a Response Message leads the body", () => {
    const raw =
      buildResponseHeader({ transactionCode: "B1" }) +
      RS +
      buildSegment({ id: "20", fields: [["F4", "SYNTHETIC NOTE"]] }) +
      GS +
      buildSegment({ id: "21", fields: [["AN", "P"]] });
    const t = parseTelecom(raw);

    expect(t.kind).toBe("response");
    expect(t.transactions).toHaveLength(1);
    expect(t.warnings).toHaveLength(0);
    expect(ids(t.transmissionSegments)).toEqual(["20"]);
    expect(ids(t.transactions[0]?.segments ?? [])).toEqual(["21"]);
    expect(adjudication(t)?.status?.disposition).toBe("paid");
  });
});

describe("the serializer writes transmission-level segments back in front of the Group Separator", () => {
  it("writes a request it used to refuse, and the result re-parses to the same split", () => {
    const t = parseTelecom(oneClaim());
    const wire = serializeTelecom(t);
    const again = parseTelecom(wire);

    expect(wire).toBe(oneClaim());
    expect(ids(again.transmissionSegments)).toEqual(["04", "01"]);
    expect(ids(again.transactions[0]?.segments ?? [])).toEqual(["07", "03"]);
    expect(serializeTelecom(again)).toBe(wire);
  });

  it("writes a response with a transmission-level segment, and re-reads it the same way", () => {
    const raw =
      buildResponseHeader({ transactionCode: "B1" }) +
      RS +
      buildSegment({ id: "20", fields: [["F4", "SYNTHETIC NOTE"]] }) +
      GS +
      buildSegment({ id: "21", fields: [["AN", "P"]] });
    const wire = serializeTelecom(parseTelecom(raw));
    const again = parseTelecom(wire);

    expect(wire).toBe(raw);
    expect(ids(again.transmissionSegments)).toEqual(["20"]);
    expect(again.transactions).toHaveLength(1);
  });

  it("writes transmission-level segments with no transaction behind them, idempotently", () => {
    const raw = buildHeader({ transactionCode: "B1" }) + [INSURANCE, PATIENT].join(RS) + GS;
    const wire = serializeTelecom(parseTelecom(raw));

    expect(wire).toBe(raw);
    expect(serializeTelecom(parseTelecom(wire))).toBe(wire);
  });

  it("emits the bytes it is handed on segments, never a second copy of the transmission part", () => {
    // A consumer that rewrites a transmission (a de-identifier, say) hands back its own
    // `segments`; the serializer must write those, not the parsed transmission-level copy.
    const t = parseTelecom(oneClaim());
    const rewritten = buildSegment({ id: "01", fields: [["C4", "19000101"]] });
    const replaced = parseTelecom(
      buildHeader({ transactionCode: "B1" }) + [INSURANCE, rewritten].join(RS) + GS + CLAIM_ONE,
    );
    const wire = serializeTelecom({
      ...t,
      segments: [...replaced.transmissionSegments, ...t.segments.slice(2)],
    });

    expect(wire).not.toContain("19700401");
    expect(wire).toContain(`C419000101${GS}AM07`);
  });
});

describe("the tokenizers tell transmission-level segments from transactions", () => {
  const body = [INSURANCE, PATIENT].join(RS) + GS + CLAIM_ONE + GS + CLAIM_TWO;

  it("tokenizeTransmission returns both parts with their own warnings", () => {
    const decoded = tokenizeTransmission(body, 56);

    expect(ids(decoded.transmissionSegments)).toEqual(["04", "01"]);
    expect(decoded.transmissionWarnings).toHaveLength(0);
    expect(decoded.transactions.map((tx) => ids(tx.segments))).toEqual([["07"], ["07"]]);
    expect(decoded.transactions.map((tx) => tx.index)).toEqual([0, 1]);
    expect(decoded.transmissionSegments[0]?.byteOffset).toBe(56);
  });

  it("tokenizeTransactions returns only the transactions", () => {
    expect(tokenizeTransactions(body, 56).map((tx) => ids(tx.segments))).toEqual([["07"], ["07"]]);
  });

  it("tokenizeBody returns the first transaction's view: transmission-level segments, then its own", () => {
    const warnings: NcpdpTelecomWarning[] = [];
    expect(ids(tokenizeBody(body, 56, warnings))).toEqual(["04", "01", "07"]);
    expect(warnings).toHaveLength(0);
  });
});
