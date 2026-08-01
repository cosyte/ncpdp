/**
 * `defineProfile()` validation + composition, the `describe()` shape, and the
 * `partitionWarnings` / default-profile / `resolveProfile` behavioural hooks.
 * The locked hard rule (every quirk MUST cite a `fixture`) is exercised here at
 * the API level; `builtins.test.ts` proves the shipped fixtures actually
 * exhibit their conventions.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  defineProfile,
  getDefaultProfile,
  NcpdpProfileError,
  partitionWarnings,
  profiles,
  setDefaultProfile,
  type NcpdpProfileQuirk,
} from "../../src/profiles/index.js";
// `resolveProfile` is internal (parsers consume it); tests reach it directly.
import { resolveProfile } from "../../src/profiles/resolve.js";

const validQuirk: NcpdpProfileQuirk = {
  id: "person-code-required",
  standard: "telecom",
  effect: "requires",
  summary: "Insurance segment carries a Person Code (303-C3).",
  fixture: "telecom/pbm-person-code.ncpdp",
  sourceCategory: "NCPDP Telecommunication vD.0: Person Code (303-C3)",
};

afterEach(() => {
  // The only mutable module-scoped state in the library: reset between tests.
  setDefaultProfile(null);
});

describe("defineProfile: happy path", () => {
  it("builds a frozen profile with lineage = [name] and a structured describe()", () => {
    const p = defineProfile({ name: "demo", quirks: [validQuirk] });
    expect(p.name).toBe("demo");
    expect(p.lineage).toEqual(["demo"]);
    expect(Object.isFrozen(p)).toBe(true);
    const d = p.describe();
    expect(d.requires.map((q) => q.id)).toEqual(["person-code-required"]);
    expect(d.adds).toEqual([]);
    expect(d.relaxes).toEqual([]);
    expect(d.standards).toEqual(["telecom"]);
  });

  it("collects sorted, de-duplicated expectedWarnings across quirks", () => {
    const p = defineProfile({
      name: "warny",
      quirks: [
        {
          ...validQuirk,
          id: "reject-depth",
          effect: "adds",
          expectedWarnings: ["NCPDP_TELECOM_UNKNOWN_REJECT_CODE"],
        },
        {
          ...validQuirk,
          id: "dur",
          effect: "adds",
          expectedWarnings: ["NCPDP_TELECOM_UNKNOWN_REJECT_CODE"],
        },
      ],
    });
    expect(p.describe().expectedWarnings).toEqual(["NCPDP_TELECOM_UNKNOWN_REJECT_CODE"]);
  });

  it("buckets a SCRIPT quirk and reports the script standard", () => {
    const p = defineProfile({
      name: "ss",
      quirks: [
        {
          // Test-local spec, not a shipped quirk: this suite exercises
          // defineProfile's bucketing only. `defineProfile` validates the
          // fixture path's SHAPE and never opens the file; a built-in
          // additionally has to satisfy the per-quirk demonstrator in
          // builtins.test.ts, which is what actually ties a claim to evidence.
          //
          // The summary and the cited fixture are kept CONSISTENT on purpose.
          // An earlier draft of this spec paired a "tolerated version stamp"
          // summary and that expected warning with surescripts-routing.xml,
          // which is stamped 2017071 and parses with zero warnings. That is a
          // quirk/fixture mismatch sitting inside the suite that exists to
          // forbid invented quirks, and it reads as a template. Do not restore
          // it: if a spec here needs to claim a warning, cite a fixture that
          // raises it.
          //
          // `effect` is arbitrary here: this case asserts that a script quirk
          // lands in the `relaxes` bucket, so it has to say `relaxes`. The
          // shipped profile classifies this same routing convention as `adds`
          // (src/profiles/surescripts.ts). Only summary and fixture are claimed
          // to agree.
          id: "example-script-quirk",
          standard: "script",
          effect: "relaxes",
          summary: "Routing identifiers are present on routed traffic.",
          fixture: "script/surescripts-routing.xml",
          sourceCategory: "Surescripts implementation guide: message routing",
        },
      ],
    });
    expect(p.describe().relaxes.map((q) => q.id)).toEqual(["example-script-quirk"]);
    expect(p.describe().standards).toEqual(["script"]);
  });
});

describe("defineProfile: validation throws NcpdpProfileError", () => {
  it("rejects a missing name", () => {
    const noName = {};
    expect(() => defineProfile(noName as never)).toThrow(NcpdpProfileError);
  });

  it("rejects an empty name", () => {
    expect(() => defineProfile({ name: "   " })).toThrow(/non-empty string/u);
  });

  it("rejects an unknown option key with a Levenshtein hint", () => {
    const typo = { name: "x", quriks: [] };
    expect(() => defineProfile(typo as never)).toThrow(/Did you mean 'quirks'/u);
  });

  it("enforces the hard rule: a quirk without a fixture is forbidden", () => {
    const { fixture: _omitted, ...noFixture } = validQuirk;
    expect(() => defineProfile({ name: "x", quirks: [noFixture as NcpdpProfileQuirk] })).toThrow(
      /must cite a 'fixture'/u,
    );
  });

  it("rejects an absolute / escaping fixture path", () => {
    expect(() =>
      defineProfile({ name: "x", quirks: [{ ...validQuirk, fixture: "/etc/passwd" }] }),
    ).toThrow(NcpdpProfileError);
  });

  it("rejects an unknown standard", () => {
    expect(() =>
      defineProfile({
        name: "x",
        quirks: [{ ...validQuirk, standard: "fhir" as never }],
      }),
    ).toThrow(/invalid standard/u);
  });

  it("rejects an unknown effect", () => {
    expect(() =>
      defineProfile({ name: "x", quirks: [{ ...validQuirk, effect: "mutates" as never }] }),
    ).toThrow(/invalid effect/u);
  });

  it("rejects a non-kebab quirk id", () => {
    expect(() => defineProfile({ name: "x", quirks: [{ ...validQuirk, id: "Bad_Id" }] })).toThrow(
      /kebab-case/u,
    );
  });

  it("rejects duplicate quirk ids", () => {
    expect(() => defineProfile({ name: "x", quirks: [validQuirk, { ...validQuirk }] })).toThrow(
      /duplicate quirk id/u,
    );
  });

  it("rejects an unknown expected warning code", () => {
    expect(() =>
      defineProfile({
        name: "x",
        quirks: [{ ...validQuirk, expectedWarnings: ["NOT_A_REAL_CODE" as never] }],
      }),
    ).toThrow(/unknown expected warning/u);
  });

  it("carries the offending profile name on the error", () => {
    try {
      defineProfile({ name: "named", quirks: [{ ...validQuirk, id: "BAD" }] });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(NcpdpProfileError);
      expect((err as NcpdpProfileError).profileName).toBe("named");
    }
  });
});

describe("defineProfile: extends composition", () => {
  it("flattens lineage, merges quirks (child wins on id), keeps first-seen position", () => {
    const parent = defineProfile({
      name: "base",
      description: "base desc",
      quirks: [validQuirk, { ...validQuirk, id: "reject-depth", effect: "adds" }],
    });
    const child = defineProfile({
      name: "child",
      extends: parent,
      quirks: [{ ...validQuirk, id: "reject-depth", effect: "adds", summary: "child override." }],
    });
    expect(child.lineage).toEqual(["base", "child"]);
    expect(child.quirks.map((q) => q.id)).toEqual(["person-code-required", "reject-depth"]);
    expect(child.quirks.find((q) => q.id === "reject-depth")?.summary).toBe("child override.");
    // description last-wins: child omitted, inherits parent's.
    expect(child.description).toBe("base desc");
  });

  it("accepts an array of parents and inherits the LAST described parent", () => {
    const a = defineProfile({ name: "a", description: "a desc", quirks: [validQuirk] });
    const b = defineProfile({
      name: "b",
      quirks: [{ ...validQuirk, id: "reject-depth", effect: "adds" }],
    });
    const child = defineProfile({ name: "c", extends: [a, b] });
    expect(child.lineage).toEqual(["a", "b", "c"]);
    expect(child.quirks.map((q) => q.id)).toEqual(["person-code-required", "reject-depth"]);
    // b (last parent) has no description, so the inherited value is a's.
    expect(child.description).toBe("a desc");
  });
});

describe("defineProfile: additional happy + validation coverage", () => {
  it("builds a quirk-less profile (quirks omitted defaults to [])", () => {
    const p = defineProfile({ name: "bare" });
    expect(p.quirks).toEqual([]);
    expect(p.lineage).toEqual(["bare"]);
    expect(p.describe().standards).toEqual([]);
  });

  it("describe() surfaces the profile description when present", () => {
    const p = defineProfile({ name: "named", description: "has a desc", quirks: [validQuirk] });
    expect(p.describe().description).toBe("has a desc");
  });

  it("rejects null options", () => {
    const nullOpts = null;
    expect(() => defineProfile(nullOpts as never)).toThrow(/options is required/u);
  });

  it("rejects a non-object quirk entry", () => {
    expect(() => defineProfile({ name: "x", quirks: [null as never] })).toThrow(
      /must be an object/u,
    );
  });

  it("rejects a quirk with an empty summary", () => {
    expect(() => defineProfile({ name: "x", quirks: [{ ...validQuirk, summary: "  " }] })).toThrow(
      /non-empty summary/u,
    );
  });

  it("rejects a quirk with an empty sourceCategory", () => {
    expect(() =>
      defineProfile({ name: "x", quirks: [{ ...validQuirk, sourceCategory: "" }] }),
    ).toThrow(/non-empty sourceCategory/u);
  });

  it("rejects an unknown option key with NO close match (no hint)", () => {
    const farKey = { name: "x", zzzzzzzzz: true };
    expect(() => defineProfile(farKey as never)).toThrow(/unknown option key 'zzzzzzzzz'/u);
    expect(() => defineProfile(farKey as never)).not.toThrow(/Did you mean/u);
  });

  it("dedupes a shared ancestor name across a diamond lineage", () => {
    const grand = defineProfile({ name: "grand", quirks: [validQuirk] });
    const left = defineProfile({
      name: "left",
      extends: grand,
      quirks: [{ ...validQuirk, id: "reject-depth", effect: "adds" }],
    });
    const right = defineProfile({
      name: "right",
      extends: grand,
      quirks: [{ ...validQuirk, id: "dur", effect: "adds" }],
    });
    const child = defineProfile({ name: "child", extends: [left, right] });
    // "grand" appears in both parents' lineages: deduped to a single entry.
    expect(child.lineage).toEqual(["grand", "left", "right", "child"]);
  });
});

describe("partitionWarnings", () => {
  it("splits warnings into expected vs unexpected by the profile's union", () => {
    const profile = defineProfile({
      name: "p",
      quirks: [
        {
          ...validQuirk,
          id: "reject-depth",
          effect: "adds",
          expectedWarnings: ["NCPDP_TELECOM_UNKNOWN_REJECT_CODE"],
        },
      ],
    });
    const warnings = [
      { code: "NCPDP_TELECOM_UNKNOWN_REJECT_CODE" as const, message: "x" },
      { code: "NCPDP_TELECOM_STATUS_CONFLICT" as const, message: "y" },
    ];
    const { expected, unexpected } = partitionWarnings(warnings, profile);
    expect(expected.map((w) => w.code)).toEqual(["NCPDP_TELECOM_UNKNOWN_REJECT_CODE"]);
    expect(unexpected.map((w) => w.code)).toEqual(["NCPDP_TELECOM_STATUS_CONFLICT"]);
  });
});

describe("default profile + resolveProfile precedence", () => {
  it("getDefaultProfile is undefined until set", () => {
    expect(getDefaultProfile()).toBeUndefined();
  });

  it("set/get round-trips and clears on null", () => {
    setDefaultProfile(profiles.pbm);
    expect(getDefaultProfile()?.name).toBe("pbm");
    setDefaultProfile(null);
    expect(getDefaultProfile()).toBeUndefined();
  });

  it("explicit profile wins; null opts out; undefined consults the default", () => {
    setDefaultProfile(profiles.pbm);
    expect(resolveProfile(profiles.surescripts)?.name).toBe("surescripts");
    expect(resolveProfile(null)).toBeUndefined();
    expect(resolveProfile(undefined)?.name).toBe("pbm");
  });
});
