import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { VERSION } from "../src/index.js";

const pkg: unknown = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

/** Narrow the parsed manifest without an `as` cast: the sanity test must not lie about its input. */
function manifestVersion(manifest: unknown): string {
  if (typeof manifest !== "object" || manifest === null || !("version" in manifest)) {
    throw new Error("package.json did not parse to an object with a `version` field");
  }
  const { version } = manifest;
  if (typeof version !== "string") throw new Error("package.json `version` is not a string");
  return version;
}

describe("toolchain sanity", () => {
  it("resolves the public entry point and exports VERSION as a string", () => {
    expect(typeof VERSION).toBe("string");
    expect(VERSION.length).toBeGreaterThan(0);
  });

  it("package exports VERSION matching package.json", () => {
    // Compared against package.json, never a hardcoded literal. `changeset version` rewrites
    // package.json alone; `scripts/sync-version.mjs` rewrites the constant, and the `version` script
    // is what runs the two together. If that step is ever removed, reordered, or fails silently, the
    // package publishes a VERSION that lies about the release it shipped in. A sibling package did
    // exactly that on three consecutive releases, all of them exporting "0.0.0", while a shape-only
    // assertion identical to the one below stayed green throughout. The release flow opens a version
    // bump as a pull request, and CI runs on pull requests, so this is the assertion that reds there.
    //
    // It answers exactly one question: does the exported constant equal the version being released?
    // It deliberately does not also check that the sync script is still wired into `version`. That
    // is a second question, and one predicate serving two is how a gate goes half-blind.
    expect(VERSION).toBe(manifestVersion(pkg));
  });

  it("exposes VERSION as a semver-looking string", () => {
    // Shape only, so a bump needs no edit here: the value itself is pinned to package.json above.
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(?:[.-].+)?$/);
  });
});
