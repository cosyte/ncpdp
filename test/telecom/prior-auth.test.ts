import { describe, expect, it } from "vitest";

import { parseTelecom, priorAuthorization } from "../../src/telecom/index.js";
import { buildTransmission } from "../_helpers/build-telecom.js";

describe("priorAuthorization — presence, not adjudication (12)", () => {
  it("surfaces the submitted type and number verbatim when the segment is present", () => {
    const raw = buildTransmission({ transactionCode: "B1" }, [
      [
        { id: "07", fields: [["D7", "00093123456"]] },
        {
          id: "12",
          fields: [
            ["EU", "1"],
            ["EV", "PA00012345"],
          ],
        },
      ],
    ]);
    const pa = priorAuthorization(parseTelecom(raw));
    expect(pa).toEqual({ present: true, typeCode: "1", numberSubmitted: "PA00012345" });
    expect(Object.isFrozen(pa)).toBe(true);
  });

  it("reports presence even when type/number are absent", () => {
    const raw = buildTransmission({ transactionCode: "B1" }, [
      [
        { id: "07", fields: [["D7", "00093123456"]] },
        { id: "12", fields: [] },
      ],
    ]);
    expect(priorAuthorization(parseTelecom(raw))).toEqual({ present: true });
  });

  it("is undefined when there is no prior-authorization segment", () => {
    const raw = buildTransmission({ transactionCode: "B1" }, [
      [{ id: "07", fields: [["D7", "00093123456"]] }],
    ]);
    expect(priorAuthorization(parseTelecom(raw))).toBeUndefined();
  });
});
