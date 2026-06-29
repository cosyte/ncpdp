import { describe, expect, it } from "vitest";

import {
  parseTelecom,
  claim,
  detectVersion,
  decodeD0Header,
  undecodedHeader,
  splitWithOffsets,
  tokenizeBody,
  findSegment,
  fieldValue,
  impliedThreeDecimal,
  telecomQuantity,
  NcpdpTelecomParseError,
  TELECOM_FATAL_CODES,
  TELECOM_WARNING_CODES,
  type NcpdpTelecomWarning,
} from "../../src/telecom/index.js";
import { FS, GS, buildHeader, buildTransmission, syntheticB1 } from "../_helpers/build-telecom.js";

describe("telecom header", () => {
  it("detects the D.0 version stamp at offset 6", () => {
    expect(detectVersion(buildHeader()).kind).toBe("d0");
  });

  it("detects the F6 stamp and classifies it not-decoded", () => {
    const raw = "12345678F6B1".padEnd(60, " ");
    expect(detectVersion(raw)).toEqual({ kind: "f6", stamp: "F6" });
  });

  it("treats an unrecognized stamp as unsupported", () => {
    const raw = "123456ZZB1".padEnd(60, " ");
    const v = detectVersion(raw);
    expect(v.kind).toBe("unsupported");
  });

  it("decodes and trims fixed positional fields, preserving id leading zeros", () => {
    const h = decodeD0Header(
      buildHeader({ bin: "012345", transactionCode: "B1", providerId: "0009876543" }),
    );
    expect(h.binNumber).toBe("012345");
    expect(h.transactionCode).toBe("B1");
    expect(h.serviceProviderId).toBe("0009876543");
    expect(h.versionRelease).toBe("D0");
  });

  it("undecodedHeader surfaces only the version stamp", () => {
    const h = undecodedHeader("F6");
    expect(h.versionRelease).toBe("F6");
    expect(h.binNumber).toBe("");
    expect(Object.isFrozen(h)).toBe(true);
  });
});

describe("splitWithOffsets", () => {
  it("carries absolute offsets and keeps empty pieces", () => {
    expect(splitWithOffsets(`${FS}D7123`, FS, 56)).toEqual([
      { text: "", offset: 56 },
      { text: "D7123", offset: 57 },
    ]);
  });
});

describe("tokenizeBody", () => {
  it("decodes the AM-led segment id and field tokens", () => {
    const warnings: NcpdpTelecomWarning[] = [];
    const body = `AM07${FS}D7123`;
    const segs = tokenizeBody(body, 56, warnings);
    expect(segs[0]?.segmentId).toBe("07");
    expect(segs[0]?.name).toBe("Claim");
    expect(segs[0]?.fields[0]).toMatchObject({ id: "D7", value: "123" });
    expect(warnings).toHaveLength(0);
  });

  it("warns once per truncated extra transaction but decodes the first", () => {
    const warnings: NcpdpTelecomWarning[] = [];
    const body = `AM07${GS}AM04`;
    const segs = tokenizeBody(body, 56, warnings);
    expect(segs).toHaveLength(1);
    expect(segs[0]?.segmentId).toBe("07");
    expect(warnings.map((w) => w.code)).toContain(
      TELECOM_WARNING_CODES.MULTI_TRANSACTION_TRUNCATED,
    );
  });

  it("warns on an unknown segment code but preserves it", () => {
    const warnings: NcpdpTelecomWarning[] = [];
    const segs = tokenizeBody(`AM99${FS}D7X`, 56, warnings);
    expect(segs[0]?.segmentId).toBe("99");
    expect(segs[0]?.name).toBeUndefined();
    expect(warnings.map((w) => w.code)).toContain(TELECOM_WARNING_CODES.UNKNOWN_SEGMENT);
  });

  it("warns when a segment does not start with AM, leaving id empty", () => {
    const warnings: NcpdpTelecomWarning[] = [];
    const segs = tokenizeBody(`D7123`, 56, warnings);
    expect(segs[0]?.segmentId).toBe("");
    expect(segs[0]?.fields[0]?.id).toBe("D7");
    expect(warnings.map((w) => w.code)).toContain(TELECOM_WARNING_CODES.MISSING_SEGMENT_ID);
  });

  it("warns on a too-short field token but preserves it verbatim", () => {
    const warnings: NcpdpTelecomWarning[] = [];
    const segs = tokenizeBody(`AM07${FS}X`, 56, warnings);
    expect(segs[0]?.fields[0]).toMatchObject({ id: "", value: "X" });
    expect(warnings.map((w) => w.code)).toContain(TELECOM_WARNING_CODES.MALFORMED_FIELD);
  });
});

describe("impliedThreeDecimal / telecomQuantity", () => {
  it("applies the implied 3-place decimal string-wise", () => {
    expect(impliedThreeDecimal("30000")).toBe("30.000");
    expect(impliedThreeDecimal("5")).toBe("0.005");
    expect(impliedThreeDecimal("500")).toBe("0.500");
  });

  it("returns undefined for non-digit input", () => {
    expect(impliedThreeDecimal("3.0")).toBeUndefined();
    expect(impliedThreeDecimal("")).toBeUndefined();
  });

  it("wraps a quantity preserving source and validity", () => {
    expect(telecomQuantity("30000")).toEqual({
      source: "30000",
      isValid: true,
      impliedDecimal: "30.000",
    });
    expect(telecomQuantity("x")).toEqual({ source: "x", isValid: false });
  });
});

describe("parseTelecom fatals", () => {
  it("throws EMPTY_INPUT on blank input", () => {
    expect(() => parseTelecom("   ")).toThrowError(
      expect.objectContaining({ code: TELECOM_FATAL_CODES.EMPTY_INPUT }),
    );
  });

  it("throws NO_HEADER when too short to hold the fixed header", () => {
    expect(() => parseTelecom("123456D0B1")).toThrowError(
      expect.objectContaining({ code: TELECOM_FATAL_CODES.NO_HEADER }),
    );
  });

  it("throws UNSUPPORTED_VERSION on an untrusted stamp", () => {
    const raw = buildHeader({ version: "ZZ" });
    expect(() => parseTelecom(raw)).toThrowError(
      expect.objectContaining({ code: TELECOM_FATAL_CODES.UNSUPPORTED_VERSION }),
    );
  });

  it("throws INVALID_FRAMING when the body has content but no separators", () => {
    const raw = buildHeader() + "PLAINTEXTBODYNOFRAMING";
    expect(() => parseTelecom(raw)).toThrowError(
      expect.objectContaining({ code: TELECOM_FATAL_CODES.INVALID_FRAMING }),
    );
  });

  it("is a real NcpdpTelecomParseError carrying a position", () => {
    try {
      parseTelecom("");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(NcpdpTelecomParseError);
      expect((err as NcpdpTelecomParseError).position?.byteOffset).toBe(0);
    }
  });
});

describe("parseTelecom F6", () => {
  it("recognizes but does not decode F6, warning and leaving the body untokenized", () => {
    const raw = "12345678F6B1".padEnd(80, " ");
    const t = parseTelecom(raw);
    expect(t.header.versionRelease).toBe("F6");
    expect(t.segments).toHaveLength(0);
    expect(t.warnings.map((w) => w.code)).toContain(TELECOM_WARNING_CODES.VF6_NOT_DECODED);
  });
});

describe("parseTelecom + claim (B1)", () => {
  it("decodes the header and lifts the safety fields", () => {
    const t = parseTelecom(syntheticB1());
    expect(t.header.transactionCode).toBe("B1");
    expect(t.transactionCount).toBe("1");

    const c = claim(t);
    expect(c?.transactionCode).toBe("B1");
    expect(c?.cardholderId).toBe("SYNTHCARD01");
    expect(c?.groupId).toBe("GRP123");
    expect(c?.personCode).toBe("01");
    expect(c?.dateOfBirth).toBe("19800101");
    expect(c?.genderCode).toBe("1");
    expect(c?.prescriptionReferenceNumber).toBe("RX0000001");
    expect(c?.fillNumber).toBe("00");
    expect(c?.product).toEqual({
      id: "00093123456",
      qualifier: "03",
      qualifierMeaning: "NDC",
    });
    expect(c?.quantityDispensed?.impliedDecimal).toBe("30.000");
    expect(c?.daysSupply?.source).toBe("30");
    expect(c?.dispenseAsWritten).toBe("0");
    expect(c?.prescriberId).toBe("1700000000");
    expect(c?.prescriberIdQualifier).toBe("01");
  });

  it("accepts a Buffer and decodes equivalently", () => {
    const c = claim(parseTelecom(Buffer.from(syntheticB1(), "latin1")));
    expect(c?.product?.id).toBe("00093123456");
  });

  it("claim is undefined when there are no segments (header only)", () => {
    const t = parseTelecom(buildHeader());
    expect(t.segments).toHaveLength(0);
    expect(claim(t)).toBeUndefined();
  });

  it("a product with an unrecognized qualifier has no meaning but is preserved", () => {
    const raw = buildTransmission({ transactionCode: "B1" }, [
      [
        {
          id: "07",
          fields: [
            ["E1", "99"],
            ["D7", "X"],
          ],
        },
      ],
    ]);
    expect(claim(parseTelecom(raw))?.product).toEqual({ id: "X", qualifier: "99" });
  });

  it("findSegment / fieldValue locate by code and id", () => {
    const t = parseTelecom(syntheticB1());
    expect(findSegment(t.segments, "07")?.name).toBe("Claim");
    expect(fieldValue(findSegment(t.segments, "07"), "D7")).toBe("00093123456");
    expect(fieldValue(undefined, "D7")).toBeUndefined();
  });

  it("a parsed transaction is frozen", () => {
    const t = parseTelecom(syntheticB1());
    expect(Object.isFrozen(t)).toBe(true);
    expect(Object.isFrozen(t.segments)).toBe(true);
    expect(Object.isFrozen(t.warnings)).toBe(true);
  });
});
