import { describe, expect, it } from "vitest";

import {
  parseTelecom,
  cobOtherPayments,
  responseCob,
  TELECOM_WARNING_CODES,
} from "../../src/telecom/index.js";
import {
  buildTransmission,
  buildResponseTransmission,
  syntheticSecondaryClaim,
} from "../_helpers/build-telecom.js";

describe("cobOtherPayments — request COB (05)", () => {
  it("reads the prior payer with its amount-paid and patient-responsibility rows", () => {
    const payers = cobOtherPayments(parseTelecom(syntheticSecondaryClaim()));
    expect(payers).toHaveLength(1);
    expect(payers[0]).toMatchObject({
      coverageType: "01",
      payerIdQualifier: "03",
      payerId: "PRIMARY01",
      payerDate: "20260601",
    });
    expect(payers[0]?.amountsPaid).toHaveLength(1);
    expect(payers[0]?.amountsPaid[0]?.qualifier).toBe("07");
    expect(payers[0]?.amountsPaid[0]?.amount.amount).toBe("40.00");
    expect(payers[0]?.patientResponsibilityAmounts[0]).toMatchObject({ qualifier: "05" });
    expect(payers[0]?.patientResponsibilityAmounts[0]?.amount.amount).toBe("10.00");
  });

  it("surfaces two other payers, none dropped, each with its own amount rows", () => {
    const raw = buildTransmission({ transactionCode: "B1" }, [
      [
        {
          id: "05",
          fields: [
            ["4C", "2"],
            ["5C", "01"],
            ["7C", "PRIMARY"],
            ["HC", "07"],
            ["DV", "0004000"],
            ["5C", "02"],
            ["7C", "SECONDARY"],
            ["HC", "07"],
            ["DV", "0002000"],
            ["HC", "08"],
            ["DV", "0000500"],
          ],
        },
      ],
    ]);
    const payers = cobOtherPayments(parseTelecom(raw));
    expect(payers.map((p) => p.payerId)).toEqual(["PRIMARY", "SECONDARY"]);
    expect(payers[0]?.amountsPaid).toHaveLength(1);
    expect(payers[1]?.amountsPaid.map((a) => a.amount.amount)).toEqual(["20.00", "5.00"]);
    expect(payers[1]?.amountsPaid.map((a) => a.qualifier)).toEqual(["07", "08"]);
  });

  it("is empty when there is no COB segment", () => {
    const raw = buildTransmission({ transactionCode: "B1" }, [
      [{ id: "07", fields: [["D7", "00093123456"]] }],
    ]);
    expect(cobOtherPayments(parseTelecom(raw))).toEqual([]);
  });

  it("warns when the declared other-payment count disagrees with the decoded blocks", () => {
    const raw = buildTransmission({ transactionCode: "B1" }, [
      [
        {
          id: "05",
          fields: [
            ["4C", "3"],
            ["5C", "01"],
            ["7C", "PRIMARY"],
          ],
        },
      ],
    ]);
    const t = parseTelecom(raw);
    expect(cobOtherPayments(t)).toHaveLength(1);
    expect(t.warnings.map((w) => w.code)).toContain(TELECOM_WARNING_CODES.COB_COUNT_MISMATCH);
  });
});

describe("responseCob — response COB (28)", () => {
  it("reads the next-payer routing block the payer returned", () => {
    const raw = buildResponseTransmission({ transactionCode: "B1" }, [
      {
        id: "21",
        fields: [
          ["AN", "R"],
          ["FB", "41"],
        ],
      },
      {
        id: "28",
        fields: [
          ["NT", "1"],
          ["5C", "02"],
          ["6C", "03"],
          ["7C", "NEXTPAYER"],
          ["MH", "PCN999"],
          ["NU", "CARD777"],
          ["MJ", "GRP555"],
        ],
      },
    ]);
    const next = responseCob(parseTelecom(raw));
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({
      coverageType: "02",
      payerIdQualifier: "03",
      payerId: "NEXTPAYER",
      processorControlNumber: "PCN999",
      cardholderId: "CARD777",
      groupId: "GRP555",
    });
  });

  it("is empty when there is no response COB segment", () => {
    const raw = buildResponseTransmission({ transactionCode: "B1" }, [
      { id: "21", fields: [["AN", "P"]] },
    ]);
    expect(responseCob(parseTelecom(raw))).toEqual([]);
  });
});
