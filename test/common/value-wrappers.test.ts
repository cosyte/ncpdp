import { describe, expect, it } from "vitest";

import {
  decimalValue,
  ndcValue,
  recognizeCodeSystem,
  codedValue,
  NcpdpScriptParseError,
  SCRIPT_FATAL_CODES,
  scriptPosition,
  joinPath,
} from "../../src/index.js";

describe("decimalValue", () => {
  it("preserves the source string and flags validity without floats", () => {
    expect(decimalValue("0.1")).toEqual({ source: "0.1", isValid: true });
    expect(decimalValue("30")).toEqual({ source: "30", isValid: true });
    expect(decimalValue("-2.5")).toEqual({ source: "-2.5", isValid: true });
  });

  it("preserves invalid input verbatim with isValid false", () => {
    expect(decimalValue("1/2")).toEqual({ source: "1/2", isValid: false });
    expect(decimalValue("")).toEqual({ source: "", isValid: false });
    expect(decimalValue("1.2.3")).toEqual({ source: "1.2.3", isValid: false });
  });
});

describe("ndcValue", () => {
  it("classifies hyphenated segmentation shapes", () => {
    expect(ndcValue("0002-8215-01").segmentation).toBe("4-4-2");
    expect(ndcValue("00093-3105-01").segmentation).toBe("5-4-2");
    expect(ndcValue("12345-678-90").segmentation).toBe("5-3-2");
    expect(ndcValue("12345-6789-0").segmentation).toBe("5-4-1");
  });

  it("classifies bare digit strings by length", () => {
    expect(ndcValue("00093310501").segmentation).toBe("11-digit");
    expect(ndcValue("0093310501").segmentation).toBe("10-digit");
  });

  it("falls back to unknown and preserves the value", () => {
    expect(ndcValue("not-an-ndc")).toEqual({
      value: "not-an-ndc",
      segmentation: "unknown",
    });
  });

  it("classifies an out-of-spec hyphenated shape as unknown", () => {
    expect(ndcValue("1-2-3").segmentation).toBe("unknown");
  });
});

describe("recognizeCodeSystem", () => {
  it("maps common qualifiers case-insensitively", () => {
    expect(recognizeCodeSystem("ND")).toBe("NDC");
    expect(recognizeCodeSystem("ndc")).toBe("NDC");
    expect(recognizeCodeSystem("RxCUI")).toBe("RXNORM");
    expect(recognizeCodeSystem("SCT")).toBe("SNOMED");
    expect(recognizeCodeSystem("ICD-10")).toBe("ICD10");
  });

  it("returns UNKNOWN for unrecognized qualifiers", () => {
    expect(recognizeCodeSystem("zzz")).toBe("UNKNOWN");
    expect(recognizeCodeSystem("")).toBe("UNKNOWN");
  });

  it("codedValue resolves the system and preserves the raw qualifier", () => {
    const cv = codedValue("00093310501", "ND");
    expect(cv).toEqual({
      value: "00093310501",
      qualifier: "ND",
      system: "NDC",
    });
  });
});

describe("position helpers", () => {
  it("joinPath builds XPath-style paths", () => {
    expect(joinPath("/Message/Body", "NewRx")).toBe("/Message/Body/NewRx");
    expect(joinPath("/", "Message")).toBe("/Message");
  });

  it("scriptPosition is frozen", () => {
    expect(Object.isFrozen(scriptPosition("/Message"))).toBe(true);
  });
});

describe("NcpdpScriptParseError", () => {
  it("clamps the snippet to a bounded one-line form", () => {
    const long = `x${" y".repeat(100)}`;
    const err = new NcpdpScriptParseError(SCRIPT_FATAL_CODES.NOT_XML, "test", { snippet: long });
    const { snippet } = err;
    expect(snippet).toBeDefined();
    expect(snippet?.length ?? Infinity).toBeLessThanOrEqual(65);
    expect(snippet).not.toContain("\n");
  });

  it("carries a stable code and is an Error", () => {
    const err = new NcpdpScriptParseError(SCRIPT_FATAL_CODES.EMPTY_INPUT, "empty");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe(SCRIPT_FATAL_CODES.EMPTY_INPUT);
    expect(err.name).toBe("NcpdpScriptParseError");
  });
});
