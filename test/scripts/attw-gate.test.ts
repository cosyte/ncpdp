/**
 * Tests for scripts/attw.mjs, the wrapper that makes the `attw` publish gate
 * report its own failure.
 *
 * WHAT THESE PIN, AND WHY EACH ONE IS HERE:
 *
 *  1. THE UPSTREAM BEHAVIOUR THE WRAPPER EXISTS FOR. `attw` prints "This package
 *     does not contain types." and exits **0**. Every test that claims the
 *     wrapper caught a false green first asserts that the OLD invocation
 *     (`attw --pack .`, which is what this package's `attw` script used to run)
 *     really did hand back 0 on that same fixture. A test that only shows green
 *     on a good pack proves nothing. If a future `attw` upgrade fixes that exit
 *     code or rewords the sentence, these red, which is the point: a guard that
 *     silently stops matching is worse than no guard, and this is the one net in
 *     `attw.mjs` that depends on a string.
 *  2. That the wrapper turns that exit 0 into a failure.
 *  3. That the preflight catches a declared-but-missing artifact, which is the
 *     shape the observed false green actually took (a `dist/` removed, or not yet
 *     written, underneath the gate).
 *  4. THAT THE PREFLIGHT CLAIMS NO COUNTERFACTUAL, which is the claim most likely
 *     to be carried over wrongly from a single-entrypoint sibling, and which an
 *     earlier draft of this suite got wrong. `analysis.types` is
 *     `pkg.containsTypes()`, "any file in the tarball with a TS extension",
 *     computed before any entrypoint is resolved. It is a fact about the whole
 *     tarball, not about entrypoints. `@cosyte/ncpdp` exports five subpaths and a
 *     clean build emits 20 declaration files, 10 entry and 10 shared-chunk, all
 *     packed by `files: ["dist"]`. So EVERY declared declaration path can be
 *     missing while attw still exits 1 off a surviving chunk. Both that case and
 *     a partial loss are pinned here, each asserting the wrapper does not
 *     announce an exit-0 that would not have happened.
 *  5. A NEGATIVE CONTROL. On a package whose tarball really does carry types, the
 *     wrapper is transparent: same exit status as `attw` itself, and green. A gate
 *     that only ever fails is not a gate, and a false red here would cost every
 *     later run an hour.
 *  6. THE GATE'S MOST BASIC OBLIGATION, that a real `attw` failure still fails.
 *     Without this, every other test here would pass on a wrapper that swallowed
 *     attw's own exit status, because net 2 reds the untyped fixture regardless.
 *  7. The refusals that keep net 2 readable. Each of these argument and config
 *     routes was measured in this repo to make the untyped sentence unreadable
 *     and hand back exit 0, which is the exact false green this file closes.
 *
 * The fixtures are minimal throwaway packages in a temp dir, nothing about this
 * repo's own build, so the test does not need one and cannot race one. `attw` is
 * invoked with `--no-definitely-typed` so the runs stay offline; the wrapper
 * forwards arguments, which is what makes that possible.
 *
 * PHI: every fixture here is a synthetic two-line JavaScript module. No NCPDP
 * message, no patient data, and nothing this suite writes leaves the temp dir.
 *
 * SECURITY: every subprocess call uses spawnSync with array args. No exec, no
 * shell-form.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const WRAPPER = join(REPO_ROOT, "scripts", "attw.mjs");
const ATTW_BIN = join(REPO_ROOT, "node_modules", ".bin", "attw");
const UNTYPED = "This package does not contain types.";
const OFFLINE = ["--no-definitely-typed"];
// Each case shells out to `attw --pack`, which runs a real `npm pack`; two of those
// in one test comfortably exceeds this suite's 10s default.
const SPAWN_TIMEOUT = 60_000;

interface RunResult {
  code: number;
  out: string;
}

function run(bin: string, args: string[], cwd: string): RunResult {
  const r = spawnSync(bin, args, { cwd, encoding: "utf8", timeout: 120_000 });
  return { code: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** The OLD invocation: exactly what `"attw": "attw --pack ."` used to run. */
const runAttw = (cwd: string): RunResult => run(ATTW_BIN, ["--pack", ".", ...OFFLINE], cwd);
/** The NEW invocation: exactly what `"attw": "node scripts/attw.mjs"` runs. */
const runWrapper = (cwd: string, args: string[] = OFFLINE): RunResult =>
  run(process.execPath, [WRAPPER, ...args], cwd);

let root: string;

/** A package whose declaration file exists on disk but is left out of `files`. */
let typesNotPacked: string;
/** A package whose `package.json` points at a `dist/` that was never built. */
let noBuild: string;
/** A well-formed dual ESM/CJS package, the negative control. */
let wellFormed: string;
/** A package with a real attw problem: `require` resolves to ESM. */
let attwFails: string;
/** Declarations present, JS entry point missing. attw itself is green on this. */
let jsMissing: string;
/** Two entrypoints, ONE of them stripped of declarations. attw reds this itself. */
let partiallyUntyped: string;
/** Every ENTRY declaration gone, a shared-chunk declaration still packed. */
let chunkOnly: string;
/** Two entrypoints whose declarations exist on disk but reach no tarball. */
let whollyUntyped: string;
/** A declaration promised ONLY through `typesVersions`. */
let typesVersionsOnly: string;
/** A manifest that promises no relative artifact path at all. */
let promisesNothing: string;

function writePkg(dir: string, pkg: Record<string, unknown>, files: Record<string, string>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  for (const [name, body] of Object.entries(files)) {
    const full = join(dir, name);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
}

const JS = "export const a = 1;\n";
const DTS = "export declare const a: number;\n";

/**
 * A two-entrypoint package shaped like this one's manifest. Both declarations are
 * always PROMISED (in `exports` and in `files`); which ones are actually written
 * to disk is what distinguishes a partial from a total loss. That is the real
 * shape of the defect: `tsup` has not written them yet, or a `clean` removed them,
 * so the manifest still promises a file the tree does not hold.
 */
const DUAL_FILES = ["index.js", "sub/index.js", "index.d.ts", "sub/index.d.ts"];

function dualEntry(name: string, files: string[] = DUAL_FILES): Record<string, unknown> {
  return {
    name,
    version: "1.0.0",
    type: "module",
    exports: {
      ".": { types: "./index.d.ts", default: "./index.js" },
      "./sub": { types: "./sub/index.d.ts", default: "./sub/index.js" },
    },
    files,
  };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "attw-gate-"));

  typesNotPacked = join(root, "types-not-packed");
  writePkg(
    typesNotPacked,
    {
      name: "attw-gate-fixture-unpacked",
      version: "1.0.0",
      main: "./index.js",
      types: "./index.d.ts",
      files: ["index.js"],
    },
    { "index.js": "module.exports = {};\n", "index.d.ts": DTS },
  );

  noBuild = join(root, "no-build");
  writePkg(
    noBuild,
    {
      name: "attw-gate-fixture-nobuild",
      version: "1.0.0",
      type: "module",
      exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } },
      files: ["dist"],
    },
    {},
  );

  wellFormed = join(root, "well-formed");
  writePkg(
    wellFormed,
    {
      name: "attw-gate-fixture-wellformed",
      version: "1.0.0",
      type: "module",
      exports: {
        ".": {
          import: { types: "./index.d.ts", default: "./index.js" },
          require: { types: "./index.d.cts", default: "./index.cjs" },
        },
      },
      files: ["index.js", "index.d.ts", "index.cjs", "index.d.cts"],
    },
    {
      "index.js": JS,
      "index.d.ts": DTS,
      "index.cjs": "module.exports.a = 1;\n",
      "index.d.cts": DTS,
    },
  );

  // ESM-only, with no `require` condition: attw's strict profile reports
  // CJSResolvesToESM and exits non-zero of its own accord.
  attwFails = join(root, "attw-fails");
  writePkg(
    attwFails,
    {
      name: "attw-gate-fixture-problem",
      version: "1.0.0",
      type: "module",
      exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
      files: ["index.js", "index.d.ts"],
    },
    { "index.js": JS, "index.d.ts": DTS },
  );

  jsMissing = join(root, "js-missing");
  writePkg(
    jsMissing,
    {
      name: "attw-gate-fixture-jsmissing",
      version: "1.0.0",
      main: "./dist/index.js",
      types: "./index.d.ts",
      files: ["index.d.ts"],
    },
    { "index.d.ts": DTS },
  );

  // One of the two declarations is on disk, so some types still resolve.
  partiallyUntyped = join(root, "partially-untyped");
  writePkg(partiallyUntyped, dualEntry("attw-gate-fixture-partial"), {
    "index.js": JS,
    "index.d.ts": DTS,
    "sub/index.js": JS,
  });

  // Neither ENTRY declaration is on disk, but a shared-chunk declaration is, and
  // it is packed. This is the shape `tsup` actually emits here (10 entry
  // declarations plus 10 chunk declarations), and it is why the preflight claims
  // no counterfactual: `containsTypes()` is true off the chunk alone, so attw
  // reds rather than going quiet.
  chunkOnly = join(root, "chunk-only");
  writePkg(chunkOnly, dualEntry("attw-gate-fixture-chunk", [...DUAL_FILES, "chunk-abc123.d.ts"]), {
    "index.js": JS,
    "sub/index.js": JS,
    "chunk-abc123.d.ts": DTS,
  });

  // Declarations exist on disk, so the PREFLIGHT passes, but `files` keeps them
  // out of the tarball. That is the only way to reach net 2 with several
  // entrypoints: attw really runs, really prints the sentence, and really
  // exits 0.
  whollyUntyped = join(root, "wholly-untyped");
  writePkg(whollyUntyped, dualEntry("attw-gate-fixture-wholly", ["index.js", "sub/index.js"]), {
    "index.js": JS,
    "index.d.ts": DTS,
    "sub/index.js": JS,
    "sub/index.d.ts": DTS,
  });

  typesVersionsOnly = join(root, "types-versions-only");
  writePkg(
    typesVersionsOnly,
    {
      name: "attw-gate-fixture-typesversions",
      version: "1.0.0",
      main: "./index.js",
      typesVersions: { "*": { sub: ["./dist/sub/index.d.ts"] } },
      files: ["index.js"],
    },
    { "index.js": "module.exports = {};\n" },
  );

  promisesNothing = join(root, "promises-nothing");
  writePkg(
    promisesNothing,
    { name: "attw-gate-fixture-nothing", version: "1.0.0", files: ["index.js"] },
    { "index.js": "module.exports = {};\n" },
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("attw's own exit code (the reason this wrapper exists)", () => {
  it(
    "reports an untyped pack and still exits 0",
    () => {
      const r = runAttw(typesNotPacked);
      expect(r.out).toContain(UNTYPED);
      // If this ever fails because the status is now non-zero, attw has fixed the
      // early return in getExitCode() and net 2 of scripts/attw.mjs is redundant.
      // Read that file's header before deleting anything.
      expect(r.code).toBe(0);
    },
    SPAWN_TIMEOUT,
  );
});

describe("scripts/attw.mjs", () => {
  it(
    "fails when the tarball carries no types, where the old invocation exited 0",
    () => {
      const before = runAttw(typesNotPacked);
      expect(before.out).toContain(UNTYPED);
      expect(before.code).toBe(0);

      const after = runWrapper(typesNotPacked);
      expect(after.out).toContain(UNTYPED);
      expect(after.code).not.toBe(0);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "fails, naming the file, when a declared artifact was never built",
    () => {
      const r = runWrapper(noBuild);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("./dist/index.d.ts");
      expect(r.out).toContain("missing");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "names a declaration promised only through typesVersions",
    () => {
      // `typesVersions` is the node10 declaration surface. Every path in this
      // package's own copy is currently also reachable through `exports`, so
      // walking it adds nothing today; it is walked so that it cannot become the
      // only place a declaration is promised without the preflight noticing.
      const r = runWrapper(typesVersionsOnly);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("./dist/sub/index.d.ts");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "checks a main/types path written without the ./ prefix",
    () => {
      // `exports` targets must be `./`-relative by spec, but `main`/`types` need
      // not be, and `"types": "dist/index.d.ts"` is legal and common. An earlier
      // draft ran all four through the `./`-only rule, so such a path was dropped
      // from the preflight silently while the gate still reported it had checked.
      const dir = join(root, "bare-relative-path");
      writePkg(
        dir,
        {
          name: "attw-gate-fixture-bare-relative",
          version: "1.0.0",
          main: "index.js",
          types: "dist/index.d.ts",
          files: ["index.js"],
        },
        { "index.js": "module.exports = {};\n" },
      );
      const r = runWrapper(dir);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("dist/index.d.ts");
      expect(r.out).toContain("missing");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "refuses a manifest that promises no artifact path at all",
    () => {
      const r = runWrapper(promisesNothing);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("no relative artifact paths");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "does not claim attw would have said 'untyped' when only JS is missing",
    () => {
      // Measured: with the declarations intact, the old invocation reports no
      // problems and exits 0 on this fixture. The preflight still reds it, but must
      // not tell the reader something about attw's behaviour that is false here.
      const bare = runAttw(jsMissing);
      expect(bare.out).toContain("No problems found");
      expect(bare.code).toBe(0);
      const r = runWrapper(jsMissing);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("./dist/index.js");
      expect(r.out).not.toContain(UNTYPED);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "still fails when attw itself fails, with attw's own status",
    () => {
      const bare = runAttw(attwFails);
      expect(bare.code).not.toBe(0);
      expect(bare.out).not.toContain(UNTYPED);
      const wrapped = runWrapper(attwFails);
      expect(wrapped.code).toBe(bare.code);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "is transparent on a package that really does ship types",
    () => {
      const bare = runAttw(wellFormed);
      const wrapped = runWrapper(wellFormed);
      expect(bare.out).not.toContain(UNTYPED);
      expect(wrapped.code).toBe(bare.code);
      expect(wrapped.code).toBe(0);
    },
    SPAWN_TIMEOUT,
  );
});

describe("several entrypoints: the preflight claims no counterfactual", () => {
  // `analysis.types` is `containsTypes()`, which is "any file in the tarball with a
  // TS extension", computed before any entrypoint is resolved. So "untyped" is a
  // fact about the whole tarball, not about entrypoints, and the preflight (which
  // sees the manifest, never the tarball) cannot decide it. An earlier draft branched
  // on "every declared declaration path is missing" and printed "attw would have
  // EXITED 0". `chunkOnly` is the case that reds against it: that predicate is
  // satisfied there and the announcement is false, because the surviving chunk keeps
  // containsTypes() true. `partiallyUntyped` took that draft's middle branch instead,
  // so its assertion here is a forward-looking pin rather than a demonstration; the
  // branch it took carried the same wrong entrypoint mechanism in its wording.
  it(
    "attw reds a PARTIAL loss by itself, and the wrapper does not overclaim",
    () => {
      const bare = runAttw(partiallyUntyped);
      expect(bare.code).not.toBe(0);
      expect(bare.out).not.toContain(UNTYPED);

      const r = runWrapper(partiallyUntyped);
      expect(r.code).not.toBe(0);
      // The preflight names the missing declaration, which attw does not.
      expect(r.out).toContain("./sub/index.d.ts");
      expect(r.out).not.toContain("EXITED 0");
      expect(r.out).not.toContain(UNTYPED);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "a surviving shared-chunk declaration still reds, so no exit-0 is claimed",
    () => {
      // EVERY declared declaration path is missing here, which is exactly the
      // predicate the withdrawn branch keyed on. attw still reds, because the
      // chunk declaration keeps containsTypes() true.
      const bare = runAttw(chunkOnly);
      expect(bare.code).not.toBe(0);
      expect(bare.out).not.toContain(UNTYPED);

      const r = runWrapper(chunkOnly);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("./index.d.ts");
      expect(r.out).toContain("./sub/index.d.ts");
      // The regression pin: restoring the counterfactual branch reds this.
      expect(r.out).not.toContain("EXITED 0");
      expect(r.out).not.toContain(UNTYPED);
    },
    SPAWN_TIMEOUT,
  );
});

describe("net 2, with several entrypoints and the preflight satisfied", () => {
  it(
    "catches the false green when the declarations reach no tarball",
    () => {
      // The declarations are on disk, so the preflight passes and attw really
      // runs. `files` keeps them out of the tarball, so the pack is untyped.
      const before = runAttw(whollyUntyped);
      expect(before.out).toContain(UNTYPED);
      expect(before.code).toBe(0);

      const after = runWrapper(whollyUntyped);
      expect(after.code).not.toBe(0);
      expect(after.out).toContain(UNTYPED);
      // Net 2, not the preflight: attw's own transcript is present.
      expect(after.out).toContain("does not contain types");
      expect(after.out).not.toContain("promises files the build has not produced");
    },
    SPAWN_TIMEOUT,
  );
});

describe("the refusals that keep the post-check readable", () => {
  // Each of these was measured in this repo to make the old invocation exit 0 with
  // the untyped sentence unreadable, on a pack whose tarball carries no types.
  it.each([
    ["--quiet", ["--quiet"]],
    ["-q", ["-q"]],
    ["--format json", ["--format", "json"]],
    ["-f json", ["-f", "json"]],
    ["--format=json", ["--format=json"]],
    // commander sets `_combineFlagAndOptionalValue`, so a short flag swallows its
    // value into the same argv token. A whole-token match let this one through,
    // and it was measured to return exit 0 with the sentence absent.
    ["-fjson (combined short flag and value)", ["-fjson"]],
    ["-qP (a cluster containing a blinding flag)", ["-qP"]],
    ["--config-path", ["--config-path", "other.json"]],
  ])("refuses %s", (_name, extra) => {
    const r = runWrapper(typesNotPacked, [...OFFLINE, ...extra]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("attw gate");
    expect(r.out).not.toContain("No problems found");
  });

  it(
    "refuses a .attw.json that sets quiet or format",
    () => {
      const dir = join(root, "config-blinded");
      writePkg(
        dir,
        {
          name: "attw-gate-fixture-configblind",
          version: "1.0.0",
          main: "./index.js",
          types: "./index.d.ts",
          files: ["index.js"],
        },
        {
          "index.js": "module.exports = {};\n",
          "index.d.ts": DTS,
          ".attw.json": JSON.stringify({ quiet: true }),
        },
      );
      // The old invocation takes the config and goes silent: exit 0 over an
      // untyped pack, with nothing printed for a post-check to read.
      const bare = runAttw(dir);
      expect(bare.code).toBe(0);
      expect(bare.out).not.toContain(UNTYPED);

      const r = runWrapper(dir);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain(".attw.json");
    },
    SPAWN_TIMEOUT,
  );
});
