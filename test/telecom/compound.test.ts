import { describe, expect, it } from "vitest";

import { parseTelecom, compound, TELECOM_WARNING_CODES } from "../../src/telecom/index.js";
import { buildTransmission, syntheticCompoundClaim } from "../_helpers/build-telecom.js";

describe("compound — every ingredient surfaced, none dropped", () => {
  it("reads all three ingredients with product id, quantity, and cost", () => {
    const c = compound(parseTelecom(syntheticCompoundClaim()));
    expect(c?.declaredIngredientCount).toBe("3");
    expect(c?.dosageFormCode).toBe("DF1");
    expect(c?.dispensingUnitFormIndicator).toBe("2");
    expect(c?.ingredients).toHaveLength(3);
    expect(c?.ingredients.map((i) => i.productId)).toEqual([
      "00000000001",
      "00000000002",
      "00000000003",
    ]);
    expect(c?.ingredients[0]).toMatchObject({
      productIdQualifier: "03",
      qualifierMeaning: "NDC",
    });
    expect(c?.ingredients[0]?.quantity?.impliedDecimal).toBe("10.000");
    expect(c?.ingredients[0]?.drugCost?.amount).toBe("25.00");
    expect(Object.isFrozen(c)).toBe(true);
    expect(Object.isFrozen(c?.ingredients[0])).toBe(true);
  });

  it("is undefined when there is no compound segment", () => {
    const raw = buildTransmission({ transactionCode: "B1" }, [
      [{ id: "07", fields: [["D7", "00093123456"]] }],
    ]);
    expect(compound(parseTelecom(raw))).toBeUndefined();
  });

  it("splits ingredients on the product id even when the qualifier is omitted", () => {
    const raw = buildTransmission({ transactionCode: "B1" }, [
      [
        {
          id: "10",
          fields: [
            ["TE", "00000000001"],
            ["ED", "0001000"],
            ["TE", "00000000002"],
            ["ED", "0002000"],
          ],
        },
      ],
    ]);
    const c = compound(parseTelecom(raw));
    expect(c?.ingredients.map((i) => i.productId)).toEqual(["00000000001", "00000000002"]);
  });

  it("warns when the declared component count disagrees with the decoded count", () => {
    const raw = buildTransmission({ transactionCode: "B1" }, [
      [
        {
          id: "10",
          fields: [
            ["EC", "5"],
            ["RE", "03"],
            ["TE", "00000000001"],
          ],
        },
      ],
    ]);
    const t = parseTelecom(raw);
    expect(compound(t)?.ingredients).toHaveLength(1);
    expect(t.warnings.map((w) => w.code)).toContain(TELECOM_WARNING_CODES.COMPOUND_COUNT_MISMATCH);
  });

  it("does not warn when the declared count matches", () => {
    const t = parseTelecom(syntheticCompoundClaim());
    expect(t.warnings.map((w) => w.code)).not.toContain(
      TELECOM_WARNING_CODES.COMPOUND_COUNT_MISMATCH,
    );
  });
});
