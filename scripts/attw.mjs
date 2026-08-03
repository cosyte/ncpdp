#!/usr/bin/env node
/**
 * scripts/attw.mjs: the `attw` publish gate, made to report its own failure.
 *
 * WHY THIS WRAPPER EXISTS. `attw` PRINTS "This package does not contain types."
 * AND EXITS 0. That is not a bug in `attw`: an untyped package is a legitimate
 * npm package, so the CLI treats "no types at all" as a *description*, not a
 * problem. From `@arethetypeswrong/cli@0.18.4` (the version this repo pins),
 * `node_modules/@arethetypeswrong/cli/dist/getExitCode.js`, first statement:
 *
 *     export function getExitCode(analysis, opts) {
 *         if (!analysis.types) {
 *             return 0;
 *         }
 *
 * The problem list is consulted only *after* that early return, so no
 * `--profile`, `--ignore-rules` or config setting can reach it. For a package
 * that ships types, "does not contain types" does not mean "fine, untyped": it
 * means THE DECLARATIONS WERE NOT IN THE TARBALL, which is a broken publish. The
 * gate said nothing, and its caller read the 0. A false red costs an hour; A
 * FALSE GREEN MERGES.
 *
 * THE RACE ONLY SUPPLIES THE CONDITION; IT IS NOT THE DEFECT. Reproduced here
 * deterministically on a quiet box, no concurrency involved:
 *
 *     rm -rf dist && pnpm attw                     -> "does not contain types", exit 0
 *     find dist \( -name '*.d.ts' -o -name '*.d.cts' \) -delete && pnpm attw
 *                                                  -> "does not contain types", exit 0
 *
 * The second is the realistic one: `tsup` emits JS in one pass and the
 * declaration files in a later pass, so there is a window in every build where
 * `dist/` holds `.mjs`/`.cjs` and no declarations. Measured on this package by
 * polling `dist/` through a clean build: first JS at 3407 ms, first declaration
 * at 7855 ms, a window of 4448 ms. A concurrent build or `pnpm clean` in the same
 * working tree lands `attw` in that window. Which is why this is not answered
 * with a lock or a build queue: the gate is supposed to be able to tell you its
 * own inputs were missing, whatever removed them.
 *
 * WHAT `analysis.types` ACTUALLY IS, BECAUSE GETTING THIS WRONG PRODUCES A GATE
 * THAT LIES IN THE OTHER DIRECTION. It is NOT a fact about entrypoints. From
 * `@arethetypeswrong/core@0.18.4`, `checkPackage.js` computes it as
 * `pkg.containsTypes()` and returns before resolving a single entrypoint, and
 * `createPackage.js` defines that as:
 *
 *     containsTypes(directory = "/") {
 *         return this.listFiles(directory).some(ts.hasTSFileExtension);
 *     }
 *
 * ANY file in the tarball with a TS extension, anywhere, entrypoint or not. So
 * "the pack is untyped" means the tarball carries no TS-extension file at all.
 *
 * WHAT THAT MEANS HERE, AND IT IS NOT A DETAIL. This package has FIVE
 * entrypoints (`.`, `./telecom`, `./script`, `./common`, `./profiles`), and a
 * clean build emits 20 declaration files: 10 entry declarations (5 entries by 2
 * formats) and 10 shared-chunk declarations (`decimal-*.d.ts`, `warnings-*.d.cts`
 * and friends). `files` is `["dist"]`, so all 20 are packed. Consequences:
 *
 *   - Deleting only `dist/index.d.ts` + `dist/index.d.cts` exits 1 with
 *     "Import resolved to JavaScript files, but no type declarations were found".
 *     A single-entrypoint sibling reproduces the false green that way; this
 *     package does not. Do not carry that sentence over.
 *   - Deleting all 10 ENTRY declarations and leaving the 10 chunk declarations
 *     ALSO exits 1, measured, because the chunks keep `containsTypes()` true.
 *     An earlier draft of this file branched on "every declared declaration path
 *     is missing" and announced that attw would have exited 0 on exactly that
 *     tree. It would not have. The branch is gone; see the preflight below.
 *   - The false green needs the tarball to carry NO TS-extension file, which is
 *     what both reproducers above do.
 *
 * The preflight is what makes any of these name the missing file instead of
 * leaving the reader to infer it from a resolution error, and it claims nothing
 * about what attw would have done, because from the manifest alone it cannot
 * know.
 *
 * TWO NETS, and they catch different things, so keep both:
 *
 *   1. PREFLIGHT (structural, no string matching). Every relative artifact path
 *      `package.json` promises (`main`, `module`, `types`, `typings`, every
 *      string leaf of `exports`, and every string leaf of `typesVersions`) must
 *      exist and be non-empty before `attw` runs. This is the one that catches
 *      the observed race. `typesVersions` is walked because this manifest HAS
 *      one (the sibling this was ported from does not) and it is the node10
 *      declaration surface; every path in it is currently also reachable through
 *      `exports`, so today it adds no new path, and it is walked so that it
 *      cannot drift into being the only place a declaration is promised.
 *
 *   2. POST-CHECK. If `attw` still reports an untyped package, fail. The
 *      preflight cannot see this case: the declaration files can be present on
 *      disk and still be absent from the tarball, because `files` (or an
 *      `.npmignore`) left them out. No instance of that has occurred in this
 *      repo, and the manifest is not currently arranged to allow it (`files[0]`
 *      is `dist` and there is no `.npmignore`), but that is a fact about today's
 *      manifest, not a property of the build. It is the case `attw --pack`
 *      exists to catch, and the whole point here is that it catches it silently.
 *
 *   The post-check matches `attw`'s untyped sentence, which is a plain,
 *   un-chalked string in `dist/render/untyped.js`. That makes it blindable, so
 *   the arguments and config that would blind it are REFUSED rather than
 *   tolerated. See BLINDING below.
 *
 * BLINDING. Six routes were measured IN THIS REPO, against an untyped pack,
 * each restoring the exact false green by making the untyped sentence absent
 * from what this script can read: `--quiet`, `-q`, `--format json`, `-fjson`,
 * and a `.attw.json` setting either `quiet` or `format`, which `readConfig()`
 * applies after argv. All exited 0 with the sentence absent. All are refused
 * below, along with `--config-path`, which would move the config file out of
 * view; that one by inference, not because it was measured.
 *
 * `-fjson` is the one that shows why the short forms need their own rule rather
 * than a whole-token match: attw drives `commander` with
 * `_combineFlagAndOptionalValue` set, so a short flag taking a value swallows
 * the value into the SAME argv token. A draft that matched tokens against a set
 * of option names let `-fjson` straight through, and it was measured to hand
 * back exit 0 over an untyped pack.
 *
 * The refusal is BY OPTION NAME, WHOLESALE, not by value, and for short forms by
 * any letter in the cluster. `--format table` was measured to still print the
 * sentence, and it is refused anyway. That is the deliberate trade:
 * value-parsing these would be a third moving part in the guard, and being
 * over-strict about an argument nobody passes to a repo's own publish gate costs
 * less than a route back to a false green.
 *
 * Other arguments are forwarded, so `--profile node16` and friends still work.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ATTW_BIN = fileURLToPath(new URL("../node_modules/.bin/attw", import.meta.url));
const UNTYPED = "This package does not contain types.";
const args = process.argv.slice(2);

const die = (msg) => {
  process.stderr.write(`\n[x] attw gate: ${msg}\n`);
  process.exit(1);
};

// ---- Refuse what would blind the post-check --------------------------------
// Long forms are matched by name, with any `=value` cut off first. Short forms
// need their own rule: attw drives `commander`, which sets
// `_combineFlagAndOptionalValue`, so `-fjson` is ONE argv token that commander
// expands to `-f json`. Matching the whole token missed it, and `-fjson` was
// measured to hand back exit 0 over an untyped pack with the sentence absent,
// which is the exact false green this file exists to close. So a single-dash
// token is treated as a CLUSTER and refused if any character in it is a blinding
// short flag. That is over-strict by design, in the same direction as refusing
// `--format` by name: it also refuses a harmless `-Pq`, and a value that merely
// contains the letter, which costs nothing on a gate nobody passes arguments to.
const BLINDING = new Set(["-q", "--quiet", "-f", "--format", "--config-path"]);
const BLINDING_SHORT = new Set(["q", "f"]);
const isBlinding = (a) => {
  if (a.startsWith("--")) return BLINDING.has(a.split("=")[0]);
  if (/^-[^-]/.test(a)) return [...a.slice(1)].some((c) => BLINDING_SHORT.has(c));
  return false;
};
const blinding = args.filter(isBlinding);
if (blinding.length > 0) {
  die(
    `${blinding.join(", ")} is refused wholesale, by option name and not by value.\n` +
      `  This gate reads attw's printed output, attw exits 0 on an untyped package,\n` +
      `  and some values of these options hide that output. Run it without them.`,
  );
}
try {
  const config = JSON.parse(readFileSync(".attw.json", "utf8"));
  const set = ["quiet", "format"].filter((k) => k in config);
  if (set.length > 0) {
    die(
      `.attw.json sets ${set.join(", ")}. These keys are refused wholesale, by name and\n` +
        `  not by value: readConfig() applies them after argv, this gate reads attw's\n` +
        `  printed output, and attw exits 0 on an untyped package.`,
    );
  }
} catch {
  // No .attw.json, or unreadable/invalid. attw itself reports the latter.
}

/** Every relative path `package.json` promises to ship, deduped. */
function declaredArtifacts(pkg) {
  const found = new Set();
  // `exports` and `typesVersions` targets are required by spec to be `./`-relative,
  // so a leaf that is not is a package specifier or a pattern, and is not ours.
  const addTarget = (v) => {
    if (typeof v !== "string") return;
    // Skip wildcard subpath patterns (they name a set, not a file) and the
    // manifest itself, which is always in the tarball by definition.
    if (!v.startsWith(".") || v.includes("*") || v === "./package.json") return;
    found.add(v);
  };
  // `main`, `module`, `types` and `typings` are ALWAYS paths, never specifiers, and
  // the `./` prefix on them is optional: `"types": "dist/index.d.ts"` is legal and
  // common. An earlier draft ran them through the `./`-only rule above, so such a
  // path was dropped from the preflight silently while the gate still reported it
  // had checked. Only an absolute path or a pattern is skipped here.
  const addPath = (v) => {
    if (typeof v !== "string" || v === "") return;
    if (v.startsWith("/") || v.includes("*")) return;
    found.add(v.startsWith(".") ? v : `./${v}`);
  };
  for (const key of ["main", "module", "types", "typings"]) addPath(pkg[key]);
  const walk = (node) => {
    if (typeof node === "string") addTarget(node);
    else if (node && typeof node === "object") for (const v of Object.values(node)) walk(v);
  };
  walk(pkg.exports);
  walk(pkg.typesVersions);
  return [...found];
}

let pkg;
try {
  pkg = JSON.parse(readFileSync("package.json", "utf8"));
} catch (err) {
  die(`cannot read ./package.json from ${process.cwd()}, ${err.message}`);
}

// ---- Net 1: preflight -------------------------------------------------------
const declared = declaredArtifacts(pkg);

// A manifest that promises nothing gives the preflight nothing to check, and the
// post-check alone would then report OK over an unexamined tree. This repo's
// standing rule for its other scanner is that an empty target set refuses rather
// than reporting OK over nothing; the same rule applies here.
if (declared.length === 0) {
  die(
    `package.json declares no relative artifact paths, so the preflight checked nothing.\n` +
      `  Expected at least one of "main", "module", "types", "typings", or a path in\n` +
      `  "exports"/"typesVersions". Refusing to report a pass from a check that read\n` +
      `  no files.`,
  );
}

const broken = [];
for (const rel of declared) {
  let size;
  try {
    size = statSync(rel).size;
  } catch {
    broken.push({ rel, why: "missing" });
    continue;
  }
  if (size === 0) broken.push({ rel, why: "empty" });
}
if (broken.length > 0) {
  // NO COUNTERFACTUAL IS CLAIMED HERE, DELIBERATELY, AND AN EARLIER DRAFT OF THIS
  // FILE GOT IT WRONG. It branched on whether every DECLARED declaration path was
  // among the casualties and, when they were, printed "attw would have exited 0".
  // That predicate cannot decide the question. `analysis.types` is
  // `pkg.containsTypes()`, which is `listFiles("/").some(ts.hasTSFileExtension)`:
  // ANY file in the tarball with a TS extension, computed before a single
  // entrypoint is resolved. `tsup` emits shared-chunk declarations alongside the
  // entry ones and `files: ["dist"]` packs both, so every declared declaration
  // path can be missing while the chunk declarations keep `containsTypes()` true
  // and attw exits 1. Measured on this package: deleting exactly the 10 declared
  // entry declarations, leaving the 10 chunk declarations, gives attw exit 1 with
  // no untyped sentence, where that draft announced it would have exited 0.
  // The preflight sees the manifest, not the tarball, so it says only what it
  // knows. The one place the exit-0 behaviour IS asserted is net 2 below, where
  // it is not a counterfactual at all: attw has just printed the sentence and
  // handed back 0.
  die(
    `package.json promises files the build has not produced:\n` +
      broken.map(({ rel, why }) => `    ${rel} (${why})\n`).join("") +
      `\n  Run the build first. If you DID build, something removed or truncated the\n` +
      `  output underneath this run: a concurrent build or \`clean\` in the same\n` +
      `  working tree will do it, and \`tsup\` writes JS before declarations, so there\n` +
      `  is a window where the declaration files do not exist yet.\n` +
      `  Refusing here rather than running attw over a tree the build did not finish:\n` +
      `  depending on what else is still in dist/, attw would report a resolution\n` +
      `  error, or nothing at all, and its exit code cannot distinguish the second\n` +
      `  case from a healthy package.\n`,
  );
}

// ---- Run attw ---------------------------------------------------------------
const res = spawnSync(ATTW_BIN, ["--pack", ".", ...args], {
  encoding: "utf8",
  stdio: ["inherit", "pipe", "pipe"],
});
if (res.error) die(`could not run ${ATTW_BIN}, ${res.error.message}`);
const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
process.stdout.write(res.stdout ?? "");
process.stderr.write(res.stderr ?? "");
if (res.status !== 0) process.exit(res.status ?? 1);

// ---- Net 2: post-check ------------------------------------------------------
// An empty transcript means the post-check read nothing, by some route not listed
// under BLINDING above. Treat that as a failure rather than as a pass: this gate
// is only as good as the output it got to see.
if (output.trim() === "") {
  die(`attw exited 0 but printed nothing, so nothing was checked.`);
}
if (output.includes(UNTYPED)) {
  die(
    `attw reported "${UNTYPED}" and exited 0.\n` +
      `  This package ships types, so that means the tarball did not carry them.\n` +
      `  Check the "files" field and .npmignore. Reported as a failure here because\n` +
      `  attw's own exit code cannot: getExitCode() returns 0 whenever the analysis\n` +
      `  found no types at all, before it ever looks at the problem list.`,
  );
}
