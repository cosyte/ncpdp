import { describe, expect, it } from "vitest";

import {
  parseTelecom,
  adjudication,
  responseStatus,
  responsePricing,
  responseDur,
  decodeResponseHeader,
  RESPONSE_HEADER_MIN_LENGTH,
  TELECOM_WARNING_CODES,
  TELECOM_FATAL_CODES,
} from "../../src/telecom/index.js";
import { buildResponseHeader, buildResponseTransmission } from "../_helpers/build-telecom.js";

/** A synthetic paid B1 response: status P, pricing, no rejects. */
function paidResponse(): string {
  return buildResponseTransmission({ transactionCode: "B1", headerResponseStatus: "A" }, [
    {
      id: "21",
      fields: [
        ["AN", "P"],
        ["F3", "AUTH0001"],
      ],
    },
    {
      id: "23",
      fields: [
        ["F5", "0001000"],
        ["F9", "0004500"],
        ["F6", "0003500"],
        ["F7", "0000100"],
        ["FM", "01"],
      ],
    },
  ]);
}

/** A synthetic rejected response carrying multiple reject codes. */
function rejectedResponse(): string {
  return buildResponseTransmission({ transactionCode: "B1", headerResponseStatus: "R" }, [
    {
      id: "21",
      fields: [
        ["AN", "R"],
        ["FA", "2"],
        ["FB", "70"],
        ["FB", "75"],
      ],
    },
  ]);
}

describe("decodeResponseHeader", () => {
  it("reads the leading version/code/status fields from the unframed region", () => {
    const h = decodeResponseHeader(
      buildResponseHeader({ transactionCode: "B2", headerResponseStatus: "A" }),
    );
    expect(h.versionRelease).toBe("D0");
    expect(h.transactionCode).toBe("B2");
    expect(h.headerResponseStatus).toBe("A");
    expect(Object.isFrozen(h)).toBe(true);
  });

  it("leaves a field empty rather than reading past the region", () => {
    const h = decodeResponseHeader("D0B11A");
    expect(h).toMatchObject({
      versionRelease: "D0",
      transactionCode: "B1",
      headerResponseStatus: "A",
    });
    expect(h.serviceProviderId).toBe("");
  });
});

describe("parseTelecom — response detection", () => {
  it("routes a response (D0 at offset 0) to the response path", () => {
    const t = parseTelecom(paidResponse());
    expect(t.kind).toBe("response");
    expect(t.responseHeader?.transactionCode).toBe("B1");
    expect(t.header.transactionCode).toBe("B1");
    expect(t.header.binNumber).toBe("");
  });

  it("a request (BIN at offset 0, D0 at offset 6) is not mistaken for a response", () => {
    const t = parseTelecom("999999D0B1".padEnd(56, " ") + "\x1eAM07\x1cD700093123456");
    expect(t.kind).toBe("request");
    expect(t.responseHeader).toBeUndefined();
  });

  it("throws NO_HEADER when shorter than the response header minimum", () => {
    expect(() => parseTelecom("D0B1")).toThrowError(
      expect.objectContaining({ code: TELECOM_FATAL_CODES.NO_HEADER }),
    );
    expect("D0B1".length).toBeLessThan(RESPONSE_HEADER_MIN_LENGTH);
  });
});

describe("responseStatus — paid", () => {
  it("reads a paid disposition with auth number and no rejects", () => {
    const s = responseStatus(parseTelecom(paidResponse()));
    expect(s).toMatchObject({
      transactionResponseStatus: "P",
      statusDescription: "Paid",
      disposition: "paid",
      statusConflict: false,
      authorizationNumber: "AUTH0001",
    });
    expect(s?.rejectCodes).toHaveLength(0);
  });
});

describe("responseStatus — rejected (a reject always wins)", () => {
  it("surfaces every reject code in wire order, none dropped", () => {
    const s = responseStatus(parseTelecom(rejectedResponse()));
    expect(s?.disposition).toBe("rejected");
    expect(s?.rejectCount).toBe("2");
    expect(s?.rejectCodes.map((r) => r.code)).toEqual(["70", "75"]);
    expect(s?.rejectCodes.every((r) => r.known)).toBe(true);
  });

  it("forces rejected and flags a conflict when status claims paid but a reject is present", () => {
    const raw = buildResponseTransmission({ transactionCode: "B1" }, [
      {
        id: "21",
        fields: [
          ["AN", "P"],
          ["FB", "70"],
        ],
      },
    ]);
    const t = parseTelecom(raw);
    const s = responseStatus(t);
    expect(s?.disposition).toBe("rejected");
    expect(s?.statusConflict).toBe(true);
    expect(t.warnings.map((w) => w.code)).toContain(TELECOM_WARNING_CODES.STATUS_CONFLICT);
  });

  it("an unrecognized status reads unknown, never paid", () => {
    const raw = buildResponseTransmission({ transactionCode: "B1" }, [
      { id: "21", fields: [["AN", "Z"]] },
    ]);
    const t = parseTelecom(raw);
    expect(responseStatus(t)?.disposition).toBe("unknown");
    expect(t.warnings.map((w) => w.code)).toContain(TELECOM_WARNING_CODES.UNKNOWN_RESPONSE_STATUS);
  });

  it("preserves an unknown reject code verbatim with known:false and warns", () => {
    const raw = buildResponseTransmission({ transactionCode: "B1" }, [
      {
        id: "21",
        fields: [
          ["AN", "R"],
          ["FB", "ZZ"],
        ],
      },
    ]);
    const t = parseTelecom(raw);
    const s = responseStatus(t);
    expect(s?.rejectCodes[0]).toEqual({ code: "ZZ", known: false });
    expect(t.warnings.map((w) => w.code)).toContain(TELECOM_WARNING_CODES.UNKNOWN_REJECT_CODE);
  });

  it("a declared reject count with no codes still resolves to rejected", () => {
    const raw = buildResponseTransmission({ transactionCode: "B1" }, [
      {
        id: "21",
        fields: [
          ["AN", "P"],
          ["FA", "1"],
        ],
      },
    ]);
    expect(responseStatus(parseTelecom(raw))?.disposition).toBe("rejected");
  });

  it("surfaces additional message information verbatim when present", () => {
    const raw = buildResponseTransmission({ transactionCode: "B1" }, [
      {
        id: "21",
        fields: [
          ["AN", "R"],
          ["FB", "70"],
          ["FQ", "CALL PLAN"],
        ],
      },
    ]);
    expect(responseStatus(parseTelecom(raw))?.additionalMessage).toBe("CALL PLAN");
  });
});

describe("responsePricing — money never float", () => {
  it("decodes each adjudicated amount string-wise, preserving source", () => {
    const p = responsePricing(parseTelecom(paidResponse()));
    expect(p?.patientPayAmount).toMatchObject({ source: "0001000", amount: "10.00" });
    expect(p?.totalAmountPaid?.amount).toBe("45.00");
    expect(p?.ingredientCostPaid?.amount).toBe("35.00");
    expect(p?.dispensingFeePaid?.amount).toBe("1.00");
    expect(p?.basisOfReimbursement).toBe("01");
  });

  it("is undefined when there is no pricing segment", () => {
    expect(responsePricing(parseTelecom(rejectedResponse()))).toBeUndefined();
  });
});

describe("responseDur — no alert is dropped", () => {
  it("splits repeating fields into one alert per occurrence", () => {
    const raw = buildResponseTransmission({ transactionCode: "B1" }, [
      { id: "21", fields: [["AN", "P"]] },
      {
        id: "24",
        fields: [
          ["J6", "1"],
          ["E4", "DD"],
          ["FS", "1"],
          ["J6", "2"],
          ["E4", "TD"],
          ["FS", "2"],
        ],
      },
    ]);
    const dur = responseDur(parseTelecom(raw));
    expect(dur).toHaveLength(2);
    expect(dur[0]).toMatchObject({
      counter: "1",
      reasonForServiceCode: "DD",
      reasonKnown: true,
      reasonDescription: "Drug-Drug Interaction",
      clinicalSignificanceCode: "1",
    });
    expect(dur[1]).toMatchObject({ counter: "2", reasonForServiceCode: "TD" });
  });

  it("splits on a repeated reason code even without a counter", () => {
    const raw = buildResponseTransmission({ transactionCode: "B1" }, [
      {
        id: "24",
        fields: [
          ["E4", "DD"],
          ["E4", "TD"],
          ["E4", "ER"],
        ],
      },
    ]);
    const dur = responseDur(parseTelecom(raw));
    expect(dur.map((d) => d.reasonForServiceCode)).toEqual(["DD", "TD", "ER"]);
  });

  it("carries the previous-fill, quantity, and free-text fields of an alert", () => {
    const raw = buildResponseTransmission({ transactionCode: "B1" }, [
      {
        id: "24",
        fields: [
          ["E4", "ER"],
          ["FU", "20260101"],
          ["FV", "30000"],
          ["FY", "REFILL TOO SOON"],
        ],
      },
    ]);
    const dur = responseDur(parseTelecom(raw));
    expect(dur[0]).toMatchObject({
      reasonForServiceCode: "ER",
      previousDateOfFill: "20260101",
      quantityOfPreviousFill: "30000",
      freeText: "REFILL TOO SOON",
    });
  });

  it("an unknown reason is preserved verbatim with reasonKnown:false", () => {
    const raw = buildResponseTransmission({ transactionCode: "B1" }, [
      { id: "24", fields: [["E4", "ZZ"]] },
    ]);
    const dur = responseDur(parseTelecom(raw));
    expect(dur[0]).toMatchObject({ reasonForServiceCode: "ZZ", reasonKnown: false });
    expect(dur[0]?.reasonDescription).toBeUndefined();
  });

  it("is empty when there is no DUR segment", () => {
    expect(responseDur(parseTelecom(paidResponse()))).toEqual([]);
  });
});

describe("adjudication — bundled view", () => {
  it("bundles status, pricing, and dur for a paid response", () => {
    const a = adjudication(parseTelecom(paidResponse()));
    expect(a?.transactionCode).toBe("B1");
    expect(a?.status?.disposition).toBe("paid");
    expect(a?.pricing?.patientPayAmount?.amount).toBe("10.00");
    expect(a?.dur).toEqual([]);
    expect(Object.isFrozen(a)).toBe(true);
  });

  it("is undefined for a request transmission", () => {
    const req = parseTelecom("999999D0B1".padEnd(56, " ") + "\x1eAM07\x1cD700093123456");
    expect(adjudication(req)).toBeUndefined();
  });

  it("carries the B2 reversal transaction code through", () => {
    const raw = buildResponseTransmission({ transactionCode: "B2" }, [
      { id: "21", fields: [["AN", "A"]] },
    ]);
    const a = adjudication(parseTelecom(raw));
    expect(a?.transactionCode).toBe("B2");
    expect(a?.status?.disposition).toBe("approved");
  });

  it("handles an E1 eligibility response with an unmodeled extra segment preserved", () => {
    const raw = buildResponseTransmission({ transactionCode: "E1" }, [
      { id: "21", fields: [["AN", "A"]] },
      { id: "25", fields: [["FB", "x"]] },
    ]);
    const t = parseTelecom(raw);
    expect(adjudication(t)?.transactionCode).toBe("E1");
    expect(t.segments.map((s) => s.segmentId)).toEqual(["21", "25"]);
  });
});
