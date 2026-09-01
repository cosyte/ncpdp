import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ENTRY_POINTS,
  readPublicSurface,
  ROOT,
  type Surface,
  type SurfaceEntry,
} from "../scripts/public-surface.js";

/**
 * WHAT THIS SUITE IS FOR. `0.1.0` says the public API is settled and stable enough to depend on.
 * Nothing in this repo enforced that: `tsc` checks the code that exists, `attw` checks that the
 * declarations resolve, `pnpm test` imports the names the suites happen to use, and none of them
 * holds an opinion about THE SET OF EXPORTS. An export could be removed, renamed or added between
 * two releases with every required check green. This suite is the opinion.
 *
 * IT PINS THE SURFACE IN BOTH DIRECTIONS, and the second direction is the one that is easy to talk
 * yourself out of. A removal breaks a consumer today, so it is obviously worth catching. An
 * ADDITION breaks nobody, which is exactly why it goes unobserved, and an API that grows unobserved
 * is not a settled one: every unnoticed export is a thing consumers start depending on before
 * anyone decided to support it, and by the next release it is load-bearing. Both fail here.
 *
 * THE RECORD IS `test/public-surface.json`, AND UPDATING IT IS THE SANCTIONED FIX. Run
 * `pnpm surface:record` and commit the result. That is not a hole in the gate: the gate never
 * promised the surface cannot move, it promises the surface cannot move without the exports moving
 * in a diff a reviewer reads. What it buys is that "we changed the public API" stops being
 * something a reviewer has to infer from a source diff and becomes a line in a file whose only job
 * is to say so.
 *
 * SEE `scripts/public-surface.ts` for why this is enumerated from the type checker rather than
 * from `import * as ns`: the surface is majority TYPES (189 of the 363 entries recorded here at
 * the time of writing), and types are erased before anything runs, so a runtime enumeration would
 * record a minority of the surface and then report a confident pass over the rest.
 */

const RECORD_PATH = join(ROOT, "test", "public-surface.json");
const RECORD_RELATIVE = "test/public-surface.json";

/** Parse the recorded surface without an `as` cast: a gate must not lie about its own input. */
function readRecordedSurface(text: string): Surface {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${RECORD_RELATIVE} did not parse to an object`);
  }
  const out: Record<string, readonly SurfaceEntry[]> = {};
  for (const [specifier, value] of Object.entries(parsed)) {
    if (!Array.isArray(value)) {
      throw new Error(`${RECORD_RELATIVE}: ${specifier} is not an array of exports`);
    }
    out[specifier] = value.map((raw: unknown, i): SurfaceEntry => {
      if (typeof raw !== "object" || raw === null || !("name" in raw) || !("kind" in raw)) {
        throw new Error(`${RECORD_RELATIVE}: ${specifier}[${String(i)}] has no name/kind`);
      }
      const { name, kind } = raw;
      if (typeof name !== "string" || typeof kind !== "string") {
        throw new Error(`${RECORD_RELATIVE}: ${specifier}[${String(i)}] name/kind is not a string`);
      }
      if (kind !== "value" && kind !== "type" && kind !== "value+type" && kind !== "unknown") {
        throw new Error(`${RECORD_RELATIVE}: ${specifier}.${name} has unknown kind ${kind}`);
      }
      return { name, kind };
    });
  }
  return out;
}

const REGENERATE = `Run \`pnpm surface:record\` and commit ${RECORD_RELATIVE} in the SAME change, then say what moved in the changeset.`;

/**
 * Compare a recorded surface against an enumerated one and return every difference, each naming
 * the export and the entry point it belongs to.
 *
 * PURE, AND EXPORTED FOR THE NEGATIVE CONTROLS BELOW. A gate that asserts it can detect is
 * documentation; this one is handed seeded removals, additions, kind changes and empty entry
 * points at the bottom of this file and is required to name each of them.
 */
export function compareSurface(recorded: Surface, actual: Surface): string[] {
  const problems: string[] = [];

  for (const specifier of Object.keys(ENTRY_POINTS)) {
    const actualEntries = actual[specifier];
    const recordedEntries = recorded[specifier];

    if (actualEntries === undefined) {
      problems.push(
        `${specifier}: published entry point was not enumerated at all, so nothing is known ` +
          `about its surface. Refusing to read that as unchanged.`,
      );
      continue;
    }
    // Criterion: an entry point that resolves to NOTHING is a failure naming that entry point,
    // never an empty surface quietly recorded and passed. An empty barrel is a broken export map
    // or a deleted module, and both of those reach a consumer as "this subpath is gone".
    if (actualEntries.length === 0) {
      problems.push(
        `${specifier}: published entry point resolves to NO exports at all. That is a broken ` +
          `entry point, not an empty surface: a consumer importing ${specifier} gets nothing. ` +
          `Refusing to record an empty surface and pass.`,
      );
      continue;
    }
    if (recordedEntries === undefined) {
      problems.push(
        `${specifier}: published entry point has no recorded surface in ${RECORD_RELATIVE}, so ` +
          `its ${String(actualEntries.length)} export(s) are unobserved. ${REGENERATE}`,
      );
      continue;
    }
    if (recordedEntries.length === 0) {
      problems.push(
        `${specifier}: recorded surface is empty while the entry point exports ` +
          `${String(actualEntries.length)} name(s). An empty record vouches for nothing. ` +
          `${REGENERATE}`,
      );
      continue;
    }

    const recordedKinds = new Map(recordedEntries.map((e) => [e.name, e.kind]));
    const actualKinds = new Map(actualEntries.map((e) => [e.name, e.kind]));

    // Direction 1: recorded but gone. A removal, or a rename seen from its old name.
    for (const [name, kind] of recordedKinds) {
      if (!actualKinds.has(name)) {
        problems.push(
          `${specifier}: export \`${name}\` (${kind}) is recorded as published but is NO LONGER ` +
            `exported from ${specifier}. A removed or renamed export is a breaking change for ` +
            `every consumer that imports it. ${REGENERATE}`,
        );
      }
    }
    // Direction 2: exported but unrecorded. An addition, or a rename seen from its new name.
    for (const [name, kind] of actualKinds) {
      if (!recordedKinds.has(name)) {
        problems.push(
          `${specifier}: export \`${name}\` (${kind}) is exported from ${specifier} but is NOT ` +
            `in the recorded surface, so the published API grew unobserved. ${REGENERATE}`,
        );
      }
    }
    // Direction 3: same name, different thing. `export const X` becoming `export type X` keeps
    // the name and breaks every consumer that called it, and a record of bare names cannot see it.
    for (const [name, kind] of actualKinds) {
      const was = recordedKinds.get(name);
      if (was !== undefined && was !== kind) {
        problems.push(
          `${specifier}: export \`${name}\` changed kind from ${was} to ${kind}. The name ` +
            `survived and the thing behind it did not. ${REGENERATE}`,
        );
      }
    }
  }

  // A record naming an entry point the package does not publish vouches for a surface no consumer
  // can reach, and would keep passing after the subpath was withdrawn.
  for (const specifier of Object.keys(recorded)) {
    if (!(specifier in ENTRY_POINTS)) {
      problems.push(
        `${specifier}: ${RECORD_RELATIVE} records an entry point that is not published by this ` +
          `package. ${REGENERATE}`,
      );
    }
  }

  return problems;
}

describe("published surface", () => {
  it(
    "matches the recorded surface exactly, in both directions",
    // Building a real TypeScript program over five entry points and their whole import graph is
    // slower than the repo's default 10s test timeout, and being slow is not a failure here.
    { timeout: 120_000 },
    () => {
      const recorded = readRecordedSurface(readFileSync(RECORD_PATH, "utf8"));
      const actual = readPublicSurface();
      const problems = compareSurface(recorded, actual);
      expect(problems, `\n${problems.join("\n\n")}\n`).toEqual([]);
    },
  );

  it("records every published entry point, and only those", () => {
    // The table in scripts/public-surface.ts is hand-written, so it is checked against the field
    // that actually decides what a consumer can import. Without this, adding a subpath to
    // `exports` and forgetting the table leaves the new entry point's whole surface unwatched
    // while every assertion above still passes.
    const manifest: unknown = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    if (typeof manifest !== "object" || manifest === null || !("exports" in manifest)) {
      throw new Error("package.json did not parse to an object with an `exports` field");
    }
    const { exports: exportsField } = manifest;
    if (typeof exportsField !== "object" || exportsField === null) {
      throw new Error("package.json `exports` is not an object");
    }
    const published = Object.keys(exportsField)
      // `./package.json` is the manifest itself. It is a real export and has no TypeScript
      // surface, so it is excluded here by name rather than by a shape rule that could widen.
      .filter((subpath) => subpath !== "./package.json")
      .map((subpath) => (subpath === "." ? "@cosyte/ncpdp" : `@cosyte/ncpdp${subpath.slice(1)}`))
      .sort();

    expect(Object.keys(ENTRY_POINTS).sort()).toEqual(published);
  });

  it("records a surface that is majority types, which a runtime enumeration cannot see", () => {
    // Not a style assertion. It is the standing evidence for why this suite goes through the type
    // checker: if this ever stops holding, the cheaper `import * as ns` enumeration becomes
    // arguable again, and it should be re-argued from the measurement rather than from memory.
    const recorded = readRecordedSurface(readFileSync(RECORD_PATH, "utf8"));
    const all = Object.values(recorded).flat();
    const typeOnly = all.filter((e) => e.kind === "type");
    expect(all.length).toBeGreaterThan(0);
    expect(typeOnly.length).toBeGreaterThan(all.length / 2);
  });
});

describe("published surface gate: negative controls", () => {
  // Every control below seeds a change the gate exists to catch and requires the gate to NAME it.
  // A gate that cannot be shown failing is documentation.
  const baseline: Surface = {
    "@cosyte/ncpdp": [
      { name: "VERSION", kind: "value" },
      { name: "ScriptMessage", kind: "value+type" },
    ],
    "@cosyte/ncpdp/script": [{ name: "parseScript", kind: "value" }],
    "@cosyte/ncpdp/telecom": [{ name: "parseTelecom", kind: "value" }],
    "@cosyte/ncpdp/common": [{ name: "deepFreeze", kind: "value" }],
    "@cosyte/ncpdp/profiles": [{ name: "defineProfile", kind: "value" }],
  };

  it("is green when the record and the surface agree", () => {
    expect(compareSurface(baseline, baseline)).toEqual([]);
  });

  it("names a removed export and the entry point it left", () => {
    const shrunk: Surface = { ...baseline, "@cosyte/ncpdp/telecom": [] as SurfaceEntry[] };
    // Emptied entirely, so the empty-entry-point rule fires first: assert the removal case on an
    // entry point that still has other exports, which is what a real removal looks like.
    const withoutVersion: Surface = {
      ...baseline,
      "@cosyte/ncpdp": [{ name: "ScriptMessage", kind: "value+type" }],
    };
    const problems = compareSurface(baseline, withoutVersion);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("VERSION");
    expect(problems[0]).toContain("@cosyte/ncpdp");
    expect(problems[0]).toContain("NO LONGER");
    expect(compareSurface(baseline, shrunk)).not.toEqual([]);
  });

  it("names an added export and its entry point", () => {
    const grown: Surface = {
      ...baseline,
      "@cosyte/ncpdp/common": [
        { name: "deepFreeze", kind: "value" },
        { name: "brandNewHelper", kind: "value" },
      ],
    };
    const problems = compareSurface(baseline, grown);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("brandNewHelper");
    expect(problems[0]).toContain("@cosyte/ncpdp/common");
    expect(problems[0]).toContain("grew unobserved");
  });

  it("names a rename from both sides", () => {
    const renamed: Surface = {
      ...baseline,
      "@cosyte/ncpdp/script": [{ name: "parseScriptMessage", kind: "value" }],
    };
    const problems = compareSurface(baseline, renamed);
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain("parseScript");
    expect(problems.join("\n")).toContain("parseScriptMessage");
  });

  it("names an entry point that resolves to no exports at all", () => {
    const emptied: Surface = { ...baseline, "@cosyte/ncpdp/profiles": [] as SurfaceEntry[] };
    const problems = compareSurface(baseline, emptied);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("@cosyte/ncpdp/profiles");
    expect(problems[0]).toContain("NO exports at all");
  });

  it("names an export whose kind changed under a surviving name", () => {
    const flipped: Surface = {
      ...baseline,
      "@cosyte/ncpdp": [
        { name: "VERSION", kind: "type" },
        { name: "ScriptMessage", kind: "value+type" },
      ],
    };
    const problems = compareSurface(baseline, flipped);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("VERSION");
    expect(problems[0]).toContain("changed kind from value to type");
  });

  it("refuses an empty record rather than passing over an unobserved surface", () => {
    const noRecord: Surface = { ...baseline, "@cosyte/ncpdp/telecom": [] as SurfaceEntry[] };
    const problems = compareSurface(noRecord, baseline);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("@cosyte/ncpdp/telecom");
    expect(problems[0]).toContain("vouches for nothing");
  });
});
