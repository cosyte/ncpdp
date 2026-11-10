/**
 * The root entry, `@cosyte/ncpdp`, carries every export of every subpath.
 *
 * A consumer who imports from the root should not have to learn which half of the Telecom API was
 * re-exported there and which half lives only on `@cosyte/ncpdp/telecom`. These cases hold the root
 * to the whole surface of each subpath, values at runtime and types through the recorded surface
 * (`test/public-surface.json`, which `public-surface.test.ts` pins against the compiler), so a name
 * added to a subpath and forgotten at the root reds here.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as root from "../src/index.js";
import * as common from "../src/common/index.js";
import * as profiles from "../src/profiles/index.js";
import * as script from "../src/script/index.js";
import * as telecom from "../src/telecom/index.js";

const SUBPATHS = {
  "@cosyte/ncpdp/script": script,
  "@cosyte/ncpdp/telecom": telecom,
  "@cosyte/ncpdp/common": common,
  "@cosyte/ncpdp/profiles": profiles,
} as const;

interface RecordedEntry {
  readonly name: string;
  readonly kind: string;
}

/** Read the recorded surface of one entry point, narrowing without an `as` cast. */
function recorded(specifier: string): readonly RecordedEntry[] {
  const parsed: unknown = JSON.parse(
    readFileSync(new URL("./public-surface.json", import.meta.url), "utf8"),
  );
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("public-surface.json did not parse to an object");
  }
  const entries: unknown = new Map<string, unknown>(Object.entries(parsed)).get(specifier);
  if (!Array.isArray(entries)) throw new Error(`${specifier} is not a list of exports`);
  return entries.map((entry: unknown) => {
    if (typeof entry !== "object" || entry === null || !("name" in entry) || !("kind" in entry)) {
      throw new Error(`${specifier} carries an entry with no name or kind`);
    }
    const { name, kind } = entry;
    if (typeof name !== "string" || typeof kind !== "string") {
      throw new Error(`${specifier} carries a name or kind that is not a string`);
    }
    return { name, kind };
  });
}

describe("the root entry carries every subpath export", () => {
  for (const [specifier, namespace] of Object.entries(SUBPATHS)) {
    it(`re-exports every value of ${specifier}`, () => {
      const rootValues: Record<string, unknown> = root;
      const missing = Object.keys(namespace).filter((name) => !(name in rootValues));
      expect(missing).toEqual([]);
      // In source the root re-exports the subpath's own binding, never a look-alike. The built
      // entry points are bundled apart, so this identity is a source-level fact only.
      for (const [name, value] of Object.entries(namespace)) {
        expect(rootValues[name], name).toBe(value);
      }
    });

    it(`re-exports every type and value of ${specifier} in the recorded surface`, () => {
      const atRoot = new Map(recorded("@cosyte/ncpdp").map((e) => [e.name, e.kind]));
      const missing = recorded(specifier).filter((e) => atRoot.get(e.name) !== e.kind);
      expect(missing.map((e) => e.name)).toEqual([]);
    });
  }

  it("reads the Telecom response, money and repeated-field helpers from the root", () => {
    expect(root.telecomMoney("0001250").amount).toBe("12.50");
    expect(root.fieldValues).toBe(telecom.fieldValues);
    expect(root.adjudication).toBe(telecom.adjudication);
  });
});
