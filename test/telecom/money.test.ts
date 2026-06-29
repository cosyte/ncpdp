import { describe, expect, it } from "vitest";

import { telecomMoney } from "../../src/telecom/index.js";

describe("telecomMoney — implied 2-place decimal", () => {
  it("applies the implied decimal to an unsigned digit run", () => {
    expect(telecomMoney("0001000")).toEqual({
      source: "0001000",
      isValid: true,
      amount: "10.00",
      isNegative: false,
    });
  });

  it("pads a sub-dollar value to a leading zero", () => {
    expect(telecomMoney("5").amount).toBe("0.05");
    expect(telecomMoney("50").amount).toBe("0.50");
    expect(telecomMoney("000").amount).toBe("0.00");
  });

  it("keeps the verbatim source even when interpreted", () => {
    expect(telecomMoney("0001000").source).toBe("0001000");
  });
});

describe("telecomMoney — overpunch sign", () => {
  it("reads a positive trailing overpunch ({ = +0, A–I = +1–9)", () => {
    expect(telecomMoney("000100{")).toMatchObject({ amount: "10.00", isNegative: false });
    expect(telecomMoney("00010A").amount).toBe("1.01");
  });

  it("reads a negative trailing overpunch (} = -0, J–R = -1–9)", () => {
    expect(telecomMoney("00035}")).toMatchObject({ amount: "-3.50", isNegative: true });
    expect(telecomMoney("000350}")).toMatchObject({ amount: "-35.00", isNegative: true });
    expect(telecomMoney("00035J").amount).toBe("-3.51");
    expect(telecomMoney("00000R").amount).toBe("-0.09");
  });

  it("normalizes a signed zero to a non-negative 0.00", () => {
    expect(telecomMoney("00000}")).toMatchObject({ amount: "0.00", isNegative: false });
    expect(telecomMoney("-000")).toMatchObject({ amount: "0.00", isNegative: false });
  });
});

describe("telecomMoney — leading sign", () => {
  it("reads a leading minus / plus", () => {
    expect(telecomMoney("-350")).toMatchObject({ amount: "-3.50", isNegative: true });
    expect(telecomMoney("+350")).toMatchObject({ amount: "3.50", isNegative: false });
  });

  it("a bare sign with no digits is not valid", () => {
    expect(telecomMoney("-").isValid).toBe(false);
    expect(telecomMoney("+").isValid).toBe(false);
  });
});

describe("telecomMoney — never guesses", () => {
  it("preserves unrecognized input verbatim with isValid:false and no amount", () => {
    const m = telecomMoney("N/A");
    expect(m).toEqual({ source: "N/A", isValid: false });
    expect(m.amount).toBeUndefined();
  });

  it("rejects an embedded decimal point (never reinterprets)", () => {
    expect(telecomMoney("3.50").isValid).toBe(false);
  });

  it("rejects empty input", () => {
    expect(telecomMoney("").isValid).toBe(false);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(telecomMoney("0001000"))).toBe(true);
    expect(Object.isFrozen(telecomMoney("N/A"))).toBe(true);
  });
});
