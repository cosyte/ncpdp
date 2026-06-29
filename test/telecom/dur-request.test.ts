import { describe, expect, it } from "vitest";

import {
  parseTelecom,
  requestDur,
  responseDur,
  TELECOM_WARNING_CODES,
} from "../../src/telecom/index.js";
import { buildTransmission, buildResponseTransmission } from "../_helpers/build-telecom.js";

describe("requestDur — request DUR/PPS (08)", () => {
  it("surfaces reason, professional-service, and result codes per interaction", () => {
    const raw = buildTransmission({ transactionCode: "B1" }, [
      [
        {
          id: "08",
          fields: [
            ["E4", "DD"],
            ["E5", "M0"],
            ["E6", "1A"],
            ["8E", "11"],
            ["E4", "TD"],
            ["E5", "P0"],
          ],
        },
      ],
    ]);
    const dur = requestDur(parseTelecom(raw));
    expect(dur).toHaveLength(2);
    expect(dur[0]).toMatchObject({
      reasonForServiceCode: "DD",
      reasonKnown: true,
      reasonDescription: "Drug-Drug Interaction",
      professionalServiceCode: "M0",
      resultOfServiceCode: "1A",
      levelOfEffort: "11",
    });
    expect(dur[1]).toMatchObject({ reasonForServiceCode: "TD", professionalServiceCode: "P0" });
  });

  it("carries co-agent fields and surfaces an unknown reason verbatim with a warning", () => {
    const raw = buildTransmission({ transactionCode: "B1" }, [
      [
        {
          id: "08",
          fields: [
            ["E4", "ZZ"],
            ["J9", "03"],
            ["H7", "1700000000"],
          ],
        },
      ],
    ]);
    const t = parseTelecom(raw);
    const dur = requestDur(t);
    expect(dur[0]).toMatchObject({
      reasonForServiceCode: "ZZ",
      reasonKnown: false,
      coAgentIdQualifier: "03",
      coAgentId: "1700000000",
    });
    expect(dur[0]?.reasonDescription).toBeUndefined();
    expect(t.warnings.map((w) => w.code)).toContain(TELECOM_WARNING_CODES.UNKNOWN_DUR_REASON);
  });

  it("is empty when there is no request DUR segment", () => {
    const raw = buildTransmission({ transactionCode: "B1" }, [
      [{ id: "07", fields: [["D7", "00093123456"]] }],
    ]);
    expect(requestDur(parseTelecom(raw))).toEqual([]);
  });
});

describe("responseDur — depth (E5/E6/8E)", () => {
  it("surfaces professional-service and result codes on a returned alert", () => {
    const raw = buildResponseTransmission({ transactionCode: "B1" }, [
      {
        id: "24",
        fields: [
          ["E4", "DD"],
          ["E5", "M0"],
          ["E6", "1B"],
          ["8E", "12"],
        ],
      },
    ]);
    const dur = responseDur(parseTelecom(raw));
    expect(dur[0]).toMatchObject({
      reasonForServiceCode: "DD",
      professionalServiceCode: "M0",
      resultOfServiceCode: "1B",
      levelOfEffort: "12",
    });
  });
});
