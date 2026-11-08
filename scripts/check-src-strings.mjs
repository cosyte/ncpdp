#!/usr/bin/env node
/**
 * scripts/check-src-strings.mjs: the internal-reference rules, over the string literals in `src/`.
 *
 * WHAT THE SHARED GATE COVERS, AND THE ONE SURFACE IT DOES NOT. `cosyte-internal-refs` from
 * `@cosyte/script-utils`, configured by `scripts/internal-refs.json`, scans this package's public
 * surface, its npm metadata and the `/** *\/` doc comments in `src/` that compile into `dist/`. It
 * does not read string literals. In a parser the most widely read text is its warning and error
 * messages, and those are string literals a consumer prints to a log: six of this package's warning
 * messages once carried "this phase" into consumers' logs. So this one pass stays here, and only
 * the surface is local. The rules are the shared gate's own, compiled from the same configuration
 * file by `resolveConfig` and `compileCanonicalRules`, and proved against their samples (plus the
 * runtime-message samples below) before anything is read.
 *
 * WHAT IS READ: the text inside each double-quoted or template literal on every line of each
 * tracked `src/*.ts`, the literals on one line joined with a space. Whole-line comments are
 * skipped: the shared gate owns `/** *\/`, and a `//` comment is a place identifiers belong.
 * Single-quoted literals are not read, as the shell pass this replaces did not read them; the house
 * style writes messages in double quotes or template literals.
 *
 * EXIT CODES: 0 clean, 1 a hit (each names the file, the line and the rule), 2 the pass could not
 * run: the configuration is unusable, a rule failed its samples, git listed no source, a listed
 * file could not be read, or no literal was extracted from a source tree that must hold hundreds.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isCliEntrypoint } from "@cosyte/script-utils";
import {
  compileCanonicalRules,
  resolveConfig,
  runSelfTests,
} from "@cosyte/script-utils/internal-refs";

/** The shared gate's configuration, which this pass reads too. */
export const CONFIG_PATH = "scripts/internal-refs.json";

/** The tracked source this pass reads. */
export const SOURCE_PATHS = ["src/*.ts", "src/**/*.ts"];

/**
 * Samples in the language of a runtime message, keyed by the shared rule ids: what each rule must
 * still catch in a string literal, and the real message text it must let through.
 */
export const STRING_SAMPLES = {
  "internal-identifier": {
    positives: ["NCPDP-7 shipped this reader"],
    negatives: [
      "NCPDP_TELECOM_UNKNOWN_SEGMENT and NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY and " +
        "NCPDP_TELECOM_MULTI_TRANSACTION_TRUNCATED, ./tokenize.js and ../common/decimal.js, " +
        "NCPDP-SCRIPT and NCPDP-TELECOM and NCPDP-D.0, Reason for Service 439-E4, Segment " +
        "Identification 111-AM, Reject Code 511-FB, Cardholder ID 302-C2, B1 B2 B3 E1, SYNTH-MSG-0001",
    ],
  },
  "phase-or-wave": {
    positives: ["Added in Phase 9 and reworked in phase 10b"],
    negatives: [
      "Transaction Response Status is not modeled by this parser; preserved verbatim, disposition " +
        "reads unknown (never paid). A Phase III trial and the acute phase reactant are out of " +
        "scope, and the reader stays in phase with the source system.",
    ],
  },
  "adr-reference": {
    positives: ["Behavior fixed by ADR 0001, recorded in docs/adr/0001-xml-parser.md"],
    negatives: ["ADR is not a segment identifier, and 0001 alone is a value"],
  },
  "internal-jargon": {
    positives: ["Added by the final slice of the reader"],
    negatives: [
      "Transmission carries 3 group-separated transactions; only the first is decoded. The slice " +
        "thickness and the number of slices are DICOM attributes.",
    ],
  },
  "internal-repo-path": {
    positives: ["See operations/roadmaps/ncpdp.md"],
    negatives: [
      "Parser operations are documented in the README, and documentation for the API is generated",
    ],
  },
  "traceability-marker": {
    positives: ["Traced as [S-SIG]"],
    negatives: [
      "A character range like [S-Z], a value set written [SNOMED], and open questions about the feed",
    ],
  },
};

/**
 * The string-literal text of one source file, one entry per line that carries any.
 *
 * @param {string} text A source file's contents.
 * @returns {{ line: number, text: string }[]} The 1-based line and its literals, space-joined.
 */
export function extractStringLiterals(text) {
  const out = [];
  text.split("\n").forEach((line, index) => {
    if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) return;
    const parts = [];
    for (const match of line.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
      parts.push(match[1] ?? match[2] ?? "");
    }
    if (parts.length > 0) out.push({ line: index + 1, text: ` ${parts.join(" ")}` });
  });
  return out;
}

/** Does any of a rule's patterns match? A fresh RegExp each time, so no `lastIndex` carries over. */
function ruleMatches(rule, text) {
  return rule.patterns.some((pattern) =>
    new RegExp(pattern.source, pattern.flags.replace("g", "")).test(text),
  );
}

/**
 * The shared rules, compiled from the configuration file and proved against their samples.
 *
 * @param {string} root The repository root.
 * @returns {{ rules?: object[], refusal?: string }}
 */
export function loadRules(root) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(join(root, CONFIG_PATH), "utf8"));
  } catch (err) {
    return { refusal: `could not read ${CONFIG_PATH}: ${err.message}` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { refusal: `${CONFIG_PATH} is not a JSON object` };
  }
  const config = Object.fromEntries(Object.entries(parsed).filter(([key]) => !key.startsWith("$")));
  const { resolved, problems } = resolveConfig(config);
  if (problems !== undefined) {
    return { refusal: `${CONFIG_PATH} is not usable: ${problems.join("; ")}` };
  }
  const rules = compileCanonicalRules(resolved).map((rule) => ({
    ...rule,
    positives: [...rule.positives, ...(STRING_SAMPLES[rule.id]?.positives ?? [])],
    negatives: [...rule.negatives, ...(STRING_SAMPLES[rule.id]?.negatives ?? [])],
  }));
  const failures = runSelfTests(rules);
  if (failures.length > 0) return { refusal: failures.join("\n") };
  return { rules };
}

/**
 * Run the pass over one repository.
 *
 * @param {string} [root] The repository root (default: the working directory).
 * @returns {{ code: 0 | 1 | 2, report: string }} The exit code and what to print.
 */
export function checkSourceStrings(root = process.cwd()) {
  const { rules, refusal } = loadRules(root);
  if (rules === undefined) {
    return { code: 2, report: `check-src-strings: refusing, nothing was checked:\n${refusal}` };
  }
  let listed;
  try {
    listed = execFileSync("git", ["-C", root, "ls-files", "-z", "--", ...SOURCE_PATHS], {
      encoding: "utf8",
    })
      .split("\0")
      .filter((path) => path !== "");
  } catch (err) {
    return { code: 2, report: `check-src-strings: git could not list src/: ${err.message}` };
  }
  if (listed.length === 0) {
    return {
      code: 2,
      report: "check-src-strings: git lists no tracked src/*.ts, so nothing was read",
    };
  }
  const hits = [];
  let lines = 0;
  for (const path of listed) {
    let text;
    try {
      text = readFileSync(join(root, path), "utf8");
    } catch (err) {
      return { code: 2, report: `check-src-strings: could not read ${path}: ${err.message}` };
    }
    for (const literal of extractStringLiterals(text)) {
      lines += 1;
      for (const rule of rules) {
        if (ruleMatches(rule, literal.text)) {
          hits.push(`  ${path}:${String(literal.line)} [${rule.name}]${literal.text}`);
        }
      }
    }
  }
  if (lines === 0) {
    return {
      code: 2,
      report:
        `check-src-strings: extracted no string literal from ${String(listed.length)} source ` +
        "file(s); the extractor is broken, not the source clean",
    };
  }
  if (hits.length > 0) {
    return {
      code: 1,
      report:
        "check-src-strings: internal bookkeeping in src/ string literals, which reach a consumer " +
        "as warning and error message text:\n" +
        `${hits.join("\n")}\n` +
        "Say what the software does instead. The rule is in documentation/agent-notes.md, under " +
        '"No internal project bookkeeping on a public surface".',
    };
  }
  return {
    code: 0,
    report:
      `check-src-strings: OK (${String(lines)} line(s) of string literals in ` +
      `${String(listed.length)} source file(s), against ${String(rules.length)} shared rule(s))`,
  };
}

if (isCliEntrypoint(import.meta.url)) {
  const { code, report } = checkSourceStrings();
  (code === 0 ? process.stdout : process.stderr).write(`${report}\n`);
  process.exitCode = code;
}
