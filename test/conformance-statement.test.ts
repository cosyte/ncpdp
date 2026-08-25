import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { KNOWN_SCRIPT_VERSIONS } from "../src/script/index.js";
import { D0_HEADER_LENGTH, detectVersion } from "../src/telecom/index.js";

/**
 * The conformance-statement guard.
 *
 * `docs-content/conformance.md` is the one place this repository states what the package
 * decodes on each wire format, the public section that adopts that version, the date that
 * adoption ends, and whether any third party has tested it. A statement that is merely
 * written by hand rots the first time a version moves, so this suite couples it to the
 * shipped code rather than to a reviewer's memory. Six rules:
 *
 *  1. THE DECODED SET IS DERIVED, NOT COPIED. The SCRIPT half comes from
 *     `KNOWN_SCRIPT_VERSIONS`; the Telecom half comes from probing `detectVersion` over
 *     every two-character stamp and recording which kind it returns. The table in the
 *     statement must agree with both, IN BOTH DIRECTIONS: a version the code decodes and
 *     the statement omits fails, and so does a version the statement names and the code
 *     does not decode. That is what makes "update the statement in the same change"
 *     enforceable rather than aspirational.
 *  2. A recognized-but-undecoded stamp is stated as such and never listed among the
 *     decoded versions.
 *  3. Every dated cutover in the statement sits beside the section that sets it.
 *  4. The citation set is CLOSED: three CFR sections, two public URLs, and files in this
 *     repository. Anything else fails, because the Implementation Guides are purchased
 *     products and a citation that drifts outside that set is how prose we may not
 *     redistribute gets in.
 *  5. The statement does not overclaim. Certification, conformance testing by a third
 *     party, third-party verification and byte-for-byte vendor parity are all rejected.
 *  6. The pages that used to carry a partial version claim defer to the statement instead
 *     of restating the version set, and the statement is reachable in one hop from the
 *     README and from the documentation sidebar.
 *
 * EVERY RULE CARRIES A SEEDED COUNTEREXAMPLE, for the reason `vocab-provenance.test.ts`
 * gives: a checker whose parser has quietly stopped matching passes forever, and a green
 * run over a subject it can no longer see is worth nothing.
 *
 * WHAT THIS DELIBERATELY CANNOT SEE, said plainly rather than claimed away:
 *
 *  - **The overclaim rule is a bounded matcher, not an entailment checker.** It rejects
 *    the listed affirmative shapes in a sentence carrying no earlier negation. A sentence
 *    that opens with a negation and then asserts the opposite gets past it, and a claim
 *    phrased in words the list does not carry gets past it too. It bounds the shapes this
 *    repository has reason to write; it does not bound English.
 *  - **The version-set rule keys on the SET, not on any mention.** Two distinct shipped
 *    SCRIPT version identifiers in one prose unit, or a Telecom decode-scope phrase from
 *    the closed list below, is a restatement. A single version named in passing (a fixture
 *    stamp, the subject of a cited artifact) is not, and is deliberately left alone.
 *  - **Fenced code blocks are stripped before that sweep.** A version identifier inside a
 *    sample message is data, not a claim.
 *  - **The dates are asserted here, not derived.** They are not in the code to derive
 *    from. Each was read on 2026-08-25 out of the cited CFR section and is pinned below
 *    with the section that sets it, so a change to one without the other fails.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The statement, as a repo-relative path. Everything else on the surface defers to it. */
const STATEMENT_PATH = "docs-content/conformance.md";

/** The Docusaurus doc id the sidebar has to carry for the one-hop rule to hold. */
const STATEMENT_DOC_ID = "conformance";

/**
 * The published surface, from this repo's own definition of it (the same paths
 * `scripts/check-no-internal-refs.sh` scans). No exclusion list: every markdown file under
 * these roots is swept for a restated version set.
 */
const SURFACE_ROOTS = ["README.md", "KNOWN-LIMITATIONS.md", "TRADEMARKS.md", "docs-content"];

/**
 * The pages the statement retires a partial version claim from. Each must reach the
 * statement in one hop, so a reader who lands there is one link from the source of truth.
 */
const DEFERRING_FILES = [
  "README.md",
  "KNOWN-LIMITATIONS.md",
  "docs-content/intro.md",
  "docs-content/spec-notes-telecom.md",
];

/** The closed set of CFR sections the statement may cite. */
const ALLOWED_CFR_SECTIONS: ReadonlySet<string> = new Set([
  "45 CFR 170.205",
  "45 CFR 162.1102",
  "45 CFR 162.1202",
]);

/** The two public, non-CFR URLs the statement may cite. */
const ALLOWED_URLS: ReadonlySet<string> = new Set([
  "https://www.ncpdp.org/Resources/NCPDP-Certification-Program-FAQs",
  "https://www.healthit.gov/buzz-blog/health-it/a-new-home-for-the-electronic-prescribing-testing-tool",
]);

/** A link into this repository is a citation of a file in this repository. */
const REPO_URL_PREFIX = "https://github.com/cosyte/ncpdp/";

/** The closed set of status values a table row may carry. */
const ROW_STATUSES: ReadonlySet<string> = new Set([
  "decoded",
  "recognized, not decoded",
  "refused",
  "not decoded",
]);

/** What a row says where no public section adopts the version it names. */
const NO_SECTION_SENTINEL = "no public section found";

/**
 * The dated cutovers, each pinned to the section that sets it. Read 2026-08-25 from the
 * cited sections: 45 CFR 170.205(b)(1) expires the older SCRIPT guide on January 1, 2028;
 * 45 CFR 162.1102(c)/(e)/(f) and 45 CFR 162.1202(c)/(d)/(e) run D.0 to August 14, 2027,
 * allow either option to April 14, 2028, and leave F6 alone after that.
 */
const REQUIRED_DATE_CITATIONS: readonly { readonly date: string; readonly beside: string }[] = [
  { date: "2028-01-01", beside: "45 CFR 170.205(b)(1)" },
  { date: "2027-08-14", beside: "45 CFR 162.1102" },
  { date: "2028-04-14", beside: "45 CFR 162.1102" },
  { date: "2027-08-14", beside: "45 CFR 162.1202" },
  { date: "2028-04-14", beside: "45 CFR 162.1202" },
  { date: "2028-04-14", beside: "F6" },
];

/** Facts the honesty section has to carry, each with the shape that evidences it. */
const REQUIRED_HONESTY: readonly { readonly what: string; readonly pattern: RegExp }[] = [
  { what: "no third party has tested this package", pattern: /no third party has tested this/i },
  {
    what: "the NCPDP programme certifies individuals",
    pattern: /certifies (?:people|individuals)/i,
  },
  { what: "the ONC/NIST tool targets SCRIPT v10.6", pattern: /SCRIPT v10\.6/i },
  { what: "a synthetic corpus stands in", pattern: /synthetic/i },
  { what: "the property invariants stand in", pattern: /@cosyte\/test-utils/i },
  { what: "the fuzz job stands in", pattern: /fuzz/i },
  { what: "the coverage gates stand in", pattern: /coverage/i },
  { what: "there is no differential corpus", pattern: /no differential corpus/i },
];

/** The overclaim shapes the statement must never carry about this package. */
const OVERCLAIM_PATTERNS: readonly { readonly id: string; readonly pattern: RegExp }[] = [
  {
    id: "certified",
    pattern: /\b(?:is|are|was|were|has been|have been)\s+(?:\w+\s+){0,3}certified\b/i,
  },
  { id: "conformance-tested", pattern: /\bconformance[- ]tested\b/i },
  {
    id: "third-party-verified",
    pattern:
      /\bverified\s+by\s+(?:an?\s+|the\s+)?(?:independent\s+|external\s+)?third[- ]part(?:y|ies)\b/i,
  },
  { id: "byte-for-byte", pattern: /\bbyte[- ]for[- ]byte\b/i },
  {
    id: "vendor-parity",
    pattern:
      /\b(?:parity|compatible|compatibility|agreement)\s+with\s+(?:\w+\s+){0,3}(?:vendor|switch|processor|implementation)s?\b/i,
  },
];

/** A negation earlier in the same sentence turns an overclaim shape into a denial. */
const NEGATION = /\b(?:no|not|never|none|nothing|neither|nor|cannot|without)\b/i;

/**
 * The Telecom decode-scope phrases that count as restating the version set. Closed by
 * design: it carries the shapes that were in the tree plus the obvious re-additions, and
 * it is not a detector for "an English sentence about which version is decoded".
 */
const TELECOM_SCOPE_CLAIMS: readonly RegExp[] = [
  /\bonly\s+(?:the\s+)?v?D\.0\b/i,
  /\bv?D\.0\s+only\b/i,
  /\bv?D\.0\s+is\s+the\s+only\b/i,
];

/** A parsed row of the machine-checked table in the statement. */
interface StatementRow {
  readonly wireFormat: string;
  readonly version: string;
  readonly status: string;
  readonly publicSection: string;
  readonly adoptionEnds: string;
  readonly thirdParty: string;
}

/** What `detectVersion` does with every two-character stamp, by outcome. */
interface TelecomStampSets {
  readonly decoded: ReadonlySet<string>;
  readonly recognizedNotDecoded: ReadonlySet<string>;
}

const STAMP_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Derive, from the shipped `detectVersion`, which version stamps this package decodes and
 * which it recognizes without decoding. Every two-character stamp is offered at both
 * candidate positions the function reads, so a stamp the code starts or stops handling
 * shows up here without anyone editing a list.
 */
function probeTelecomStamps(): TelecomStampSets {
  const decoded = new Set<string>();
  const recognizedNotDecoded = new Set<string>();
  for (const a of STAMP_CHARS) {
    for (const b of STAMP_CHARS) {
      const stamp = `${a}${b}`;
      const probes = [
        `123456${stamp}B1`.padEnd(D0_HEADER_LENGTH, " "),
        `12345600${stamp}`.padEnd(D0_HEADER_LENGTH, " "),
      ];
      for (const raw of probes) {
        const classified = detectVersion(raw);
        if (classified.kind === "d0") decoded.add(stamp);
        else if (classified.kind === "f6") recognizedNotDecoded.add(classified.stamp);
      }
    }
  }
  return { decoded, recognizedNotDecoded };
}

/** Drop fenced code blocks and HTML comments: neither carries a claim. */
function stripCode(markdown: string): string {
  const out: string[] = [];
  let inFence = false;
  let inComment = false;
  for (const line of markdown.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (inComment) {
      if (line.includes("-->")) inComment = false;
      continue;
    }
    if (line.includes("<!--")) {
      inComment = !line.includes("-->");
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/**
 * Split prose into units. A unit is a paragraph, a list item with its wrapped
 * continuation lines, or a single table row: the granularity at which "this date sits
 * beside that section" and "these two versions are named together" are meaningful.
 */
function units(markdown: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  const flush = (): void => {
    if (current.length > 0) out.push(current.join(" "));
    current = [];
  };
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("- ") || trimmed.startsWith("|")) flush();
    if (trimmed !== "") current.push(trimmed);
    if (trimmed.startsWith("|")) flush();
  }
  flush();
  return out;
}

/** Split prose into sentences, for the overclaim rule. */
function sentences(markdown: string): string[] {
  return stripCode(markdown)
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim() !== "");
}

/** Strip backticks and surrounding whitespace from a table cell. */
function cellText(cell: string): string {
  return cell.replace(/`/g, "").trim();
}

/** Parse the six-column table out of the statement. */
function parseStatementRows(markdown: string): StatementRow[] {
  const rows: StatementRow[] = [];
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const inner = line.replace(/^\|/, "").replace(/\|$/, "");
    const cells = inner.split("|").map((c) => c.trim());
    if (cells.length !== 6) continue;
    if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
    if ((cells[0] ?? "").toLowerCase() === "wire format") continue;
    rows.push({
      wireFormat: cellText(cells[0] ?? ""),
      version: cellText(cells[1] ?? ""),
      status: cellText(cells[2] ?? "").toLowerCase(),
      publicSection: cellText(cells[3] ?? ""),
      adoptionEnds: cellText(cells[4] ?? ""),
      thirdParty: cellText(cells[5] ?? "").toLowerCase(),
    });
  }
  return rows;
}

/** Every CFR section citation in `text`, normalized to section granularity. */
function cfrCitations(text: string): string[] {
  return [...text.matchAll(/\b\d{2} CFR \d+\.\d+/g)].map((m) => m[0]);
}

/** Every absolute URL in `text`, trailing punctuation removed. */
function urlCitations(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s)>\]]+/g)].map((m) => m[0].replace(/[.,]+$/, ""));
}

/** Every markdown link target in `text`. */
function linkTargets(text: string): string[] {
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1] ?? "");
}

/**
 * Resolve a markdown link target against the file it appears in, as a repo-relative path.
 * Returns undefined for an anchor-only link or an absolute URL.
 */
function resolveLink(fromFile: string, target: string): string | undefined {
  if (target.startsWith("#")) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return undefined;
  const withoutAnchor = target.split("#")[0] ?? "";
  if (withoutAnchor === "") return undefined;
  return normalize(join(dirname(fromFile), withoutAnchor))
    .split("\\")
    .join("/");
}

/** True when `target`, from `fromFile`, points at the conformance statement. */
function pointsAtStatement(fromFile: string, target: string): boolean {
  const resolved = resolveLink(fromFile, target);
  if (resolved === undefined) return false;
  return resolved === STATEMENT_PATH || `${resolved}.md` === STATEMENT_PATH;
}

/** A public-section cell is a permitted citation, the sentinel, or explicitly not applicable. */
function isPermittedSectionCell(cell: string): boolean {
  const value = cell.trim();
  if (value === "n/a" || value.toLowerCase() === NO_SECTION_SENTINEL) return true;
  const citations = cfrCitations(value);
  if (citations.length === 0) return false;
  return citations.every((c) => ALLOWED_CFR_SECTIONS.has(c));
}

/** An adoption-ends cell is an ISO date, an explicit "none stated", or not applicable. */
function isPermittedDateCell(cell: string): boolean {
  const value = cell.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) || value === "none stated" || value === "n/a";
}

/**
 * Rule 1 and rule 2: the table and the shipped constants agree, in both directions, and a
 * recognized-but-undecoded stamp is never listed as decoded.
 */
function versionSetFindings(
  rows: readonly StatementRow[],
  scriptVersions: readonly string[],
  stamps: TelecomStampSets,
): string[] {
  const findings: string[] = [];
  if (rows.length === 0) {
    findings.push("the conformance statement carries no machine-readable version table");
    return findings;
  }

  for (const row of rows) {
    if (!ROW_STATUSES.has(row.status)) {
      findings.push(
        `${row.wireFormat} ${row.version}: status "${row.status}" is outside the closed set`,
      );
    }
    if (!isPermittedSectionCell(row.publicSection)) {
      findings.push(
        `${row.wireFormat} ${row.version}: public section "${row.publicSection}" is neither a permitted citation nor "${NO_SECTION_SENTINEL}"`,
      );
    }
    if (!isPermittedDateCell(row.adoptionEnds)) {
      findings.push(
        `${row.wireFormat} ${row.version}: adoption end "${row.adoptionEnds}" is not a date, "none stated" or "n/a"`,
      );
    }
    if (row.thirdParty !== "none") {
      findings.push(
        `${row.wireFormat} ${row.version}: third-party record "${row.thirdParty}" is not "none"`,
      );
    }
  }

  const decodedScript = new Set(
    rows.filter((r) => r.wireFormat === "SCRIPT" && r.status === "decoded").map((r) => r.version),
  );
  for (const version of scriptVersions) {
    if (!decodedScript.has(version)) {
      findings.push(`SCRIPT ${version}: the package decodes it and the statement does not`);
    }
  }
  for (const version of decodedScript) {
    if (!scriptVersions.includes(version)) {
      findings.push(`SCRIPT ${version}: the statement decodes it and the package does not`);
    }
  }

  const decodedTelecom = new Set(
    rows.filter((r) => r.wireFormat === "Telecom" && r.status === "decoded").map((r) => r.version),
  );
  for (const stamp of stamps.decoded) {
    if (!decodedTelecom.has(stamp)) {
      findings.push(`Telecom ${stamp}: the package decodes it and the statement does not`);
    }
  }
  for (const stamp of decodedTelecom) {
    if (!stamps.decoded.has(stamp)) {
      findings.push(`Telecom ${stamp}: the statement decodes it and the package does not`);
    }
  }

  const recognizedTelecom = new Set(
    rows
      .filter((r) => r.wireFormat === "Telecom" && r.status === "recognized, not decoded")
      .map((r) => r.version),
  );
  for (const stamp of stamps.recognizedNotDecoded) {
    if (!recognizedTelecom.has(stamp)) {
      findings.push(
        `Telecom ${stamp}: the package recognizes it without decoding it and the statement does not say so`,
      );
    }
    if (decodedTelecom.has(stamp)) {
      findings.push(`Telecom ${stamp}: listed among the decoded versions, and it is not decoded`);
    }
  }
  for (const stamp of recognizedTelecom) {
    if (!stamps.recognizedNotDecoded.has(stamp)) {
      findings.push(`Telecom ${stamp}: the statement recognizes it and the package does not`);
    }
  }
  return findings;
}

/** Rule 3: every dated cutover sits beside the section that sets it. */
function dateFindings(markdown: string): string[] {
  const findings: string[] = [];
  const prose = units(stripCode(markdown));
  for (const required of REQUIRED_DATE_CITATIONS) {
    const together = prose.some((u) => u.includes(required.date) && u.includes(required.beside));
    if (!together) {
      findings.push(`${required.date} is not stated beside ${required.beside}`);
    }
  }
  return findings;
}

/** Rule 4: the citation set is closed, and the paywall boundary is on the page. */
function citationFindings(markdown: string, fileExists: (repoPath: string) => boolean): string[] {
  const findings: string[] = [];
  for (const citation of cfrCitations(markdown)) {
    if (!ALLOWED_CFR_SECTIONS.has(citation)) {
      findings.push(`citation "${citation}" is outside the allowed set`);
    }
  }
  for (const url of urlCitations(markdown)) {
    if (ALLOWED_URLS.has(url)) continue;
    if (url.startsWith(REPO_URL_PREFIX)) continue;
    findings.push(`citation "${url}" is outside the allowed set`);
  }
  for (const target of linkTargets(markdown)) {
    const resolved = resolveLink(STATEMENT_PATH, target);
    if (resolved === undefined) continue;
    if (!fileExists(resolved) && !fileExists(`${resolved}.md`)) {
      findings.push(`relative link "${target}" resolves to no file in this repository`);
    }
  }
  if (!/purchased product/i.test(markdown)) {
    findings.push("the statement does not record that the Implementation Guides are purchased");
  }
  return findings;
}

/** Rule 5: no overclaim about this package. */
function overclaimFindings(markdown: string): string[] {
  const findings: string[] = [];
  for (const sentence of sentences(markdown)) {
    for (const claim of OVERCLAIM_PATTERNS) {
      const hit = claim.pattern.exec(sentence);
      if (hit === null) continue;
      const negation = NEGATION.exec(sentence);
      if (negation !== null && negation.index < hit.index) continue;
      findings.push(`overclaim (${claim.id}): ${sentence.trim()}`);
    }
  }
  return findings;
}

/** The honesty section carries every fact a reader needs to weigh the absence. */
function honestyFindings(markdown: string): string[] {
  const findings: string[] = [];
  for (const required of REQUIRED_HONESTY) {
    if (!required.pattern.test(markdown)) {
      findings.push(`the statement does not say: ${required.what}`);
    }
  }
  const bothFormats = sentences(markdown).some(
    (s) => /no third party has tested this/i.test(s) && /SCRIPT/.test(s) && /Telecom/i.test(s),
  );
  if (!bothFormats) {
    findings.push("the absence of a third-party record is not stated for both wire formats");
  }
  return findings;
}

/** Every restatement of the decoded version set in one file's prose. */
function versionSetClaims(prose: string, scriptVersions: readonly string[]): string[] {
  const claims: string[] = [];
  for (const unit of units(stripCode(prose))) {
    const named = [...new Set(scriptVersions.filter((v) => unit.includes(v)))];
    if (named.length >= 2) claims.push(`names ${named.join(" and ")} together`);
    for (const pattern of TELECOM_SCOPE_CLAIMS) {
      if (pattern.test(unit)) claims.push(`carries the decode-scope phrase /${pattern.source}/`);
    }
  }
  return claims;
}

/** Rule 6: one document restates the set, and the pages that deferred reach it in one hop. */
function deferralFindings(
  files: ReadonlyMap<string, string>,
  scriptVersions: readonly string[],
): string[] {
  const findings: string[] = [];
  for (const [path, text] of files) {
    if (path === STATEMENT_PATH) continue;
    for (const claim of versionSetClaims(text, scriptVersions)) {
      findings.push(`${path}: restates the decoded version set (${claim})`);
    }
  }
  for (const path of DEFERRING_FILES) {
    const text = files.get(path);
    if (text === undefined) {
      findings.push(`${path}: named as deferring to the statement and not present on the surface`);
      continue;
    }
    if (!linkTargets(text).some((target) => pointsAtStatement(path, target))) {
      findings.push(`${path}: carries no one-hop link to the conformance statement`);
    }
  }
  return findings;
}

/** Every doc id named anywhere in a Docusaurus sidebar definition. */
function sidebarDocIds(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((v: unknown) => sidebarDocIds(v));
  if (typeof value === "object" && value !== null) {
    return Object.values(value as Record<string, unknown>).flatMap((v) => sidebarDocIds(v));
  }
  return [];
}

function readSurface(): Map<string, string> {
  const files = new Map<string, string>();
  for (const root of SURFACE_ROOTS) {
    const full = join(REPO_ROOT, root);
    if (!existsSync(full)) continue;
    if (root.endsWith(".md")) {
      files.set(root, readFileSync(full, "utf8"));
      continue;
    }
    for (const entry of readdirSync(full, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      files.set(`${root}/${entry.name}`, readFileSync(join(full, entry.name), "utf8"));
    }
  }
  return files;
}

const SURFACE = readSurface();
const STATEMENT = SURFACE.get(STATEMENT_PATH) ?? "";
const ROWS = parseStatementRows(STATEMENT);
const STAMPS = probeTelecomStamps();
const SIDEBARS = JSON.parse(
  readFileSync(join(REPO_ROOT, "docs-content", "sidebars.json"), "utf8"),
) as unknown;
const fileExists = (repoPath: string): boolean => existsSync(join(REPO_ROOT, repoPath));

describe("the guard can still see its subject", () => {
  it("reads the statement off the published surface", () => {
    expect(STATEMENT).not.toBe("");
    expect(STATEMENT).toContain("# Conformance statement");
  });

  it("derives the Telecom stamps from detectVersion rather than from a list", () => {
    expect([...STAMPS.decoded].sort()).toEqual(["D0"]);
    expect([...STAMPS.recognizedNotDecoded].sort()).toEqual(["F6"]);
  });

  it("reads the machine-checked rows out of the statement", () => {
    expect(ROWS.map((r) => `${r.wireFormat} ${r.version}`)).toEqual([
      "SCRIPT 2017071",
      "SCRIPT 2023011",
      "SCRIPT legacy dotted, for example 10.6",
      "Telecom D0",
      "Telecom F6",
      "Telecom any other version stamp",
      "Telecom Batch 1.2 and 15",
    ]);
  });

  it("splits prose into units a claim can be checked against", () => {
    expect(units("- one\n  wrapped\n\npara\n")).toEqual(["- one wrapped", "para"]);
  });
});

describe("the statement names what is decoded and the section that fixes it", () => {
  it("agrees with the shipped constants in both directions", () => {
    expect(versionSetFindings(ROWS, KNOWN_SCRIPT_VERSIONS, STAMPS)).toEqual([]);
  });

  it("names each adopted version beside its public section", () => {
    const decoded = ROWS.filter((r) => r.status === "decoded");
    expect(decoded.map((r) => `${r.version} ${r.publicSection}`)).toEqual([
      "2017071 45 CFR 170.205(b)(1)",
      "2023011 45 CFR 170.205(b)(2)",
      "D0 45 CFR 162.1102(b)(2)(i); 45 CFR 162.1202(b)(2)(i)",
    ]);
  });

  // SEEDED: a version the code decodes that the statement forgot.
  it("catches a shipped version the statement omits, naming it", () => {
    const withoutOne = ROWS.filter((r) => r.version !== "2023011");
    expect(versionSetFindings(withoutOne, KNOWN_SCRIPT_VERSIONS, STAMPS)).toContain(
      "SCRIPT 2023011: the package decodes it and the statement does not",
    );
  });

  // SEEDED: a version the statement claims and the code does not decode.
  it("catches a version the statement invents, naming it", () => {
    const invented = parseStatementRows(
      "| SCRIPT | `2099001` | decoded | 45 CFR 170.205(b)(1) | none stated | none |",
    );
    expect(versionSetFindings([...ROWS, ...invented], KNOWN_SCRIPT_VERSIONS, STAMPS)).toContain(
      "SCRIPT 2099001: the statement decodes it and the package does not",
    );
  });

  // SEEDED: mentioning a version somewhere is not naming it as decoded.
  it("does not pass on a statement that merely mentions a version in prose", () => {
    const proseOnly = parseStatementRows("The package handles 2017071 and 2023011.");
    expect(proseOnly).toEqual([]);
    const findings = versionSetFindings(proseOnly, KNOWN_SCRIPT_VERSIONS, STAMPS);
    expect(findings).toContain(
      "the conformance statement carries no machine-readable version table",
    );
  });

  // SEEDED: the "no public section found" branch, which has no live instance today.
  it("accepts the no-public-section branch and refuses an unsourced cell", () => {
    const sentinel = parseStatementRows(
      "| SCRIPT | `2017071` | decoded | no public section found | none stated | none |",
    );
    expect(
      versionSetFindings(sentinel, ["2017071"], {
        decoded: new Set(),
        recognizedNotDecoded: new Set(),
      }),
    ).toEqual([]);
    const unsourced = parseStatementRows(
      "| SCRIPT | `2017071` | decoded | trust me | none stated | none |",
    );
    expect(
      versionSetFindings(unsourced, ["2017071"], {
        decoded: new Set(),
        recognizedNotDecoded: new Set(),
      }),
    ).toContain(
      'SCRIPT 2017071: public section "trust me" is neither a permitted citation nor "no public section found"',
    );
  });
});

describe("a dated adoption carries its date and the section that sets it", () => {
  it("states every required date beside its section", () => {
    expect(dateFindings(STATEMENT)).toEqual([]);
  });

  // SEEDED: a date dropped from the statement is a failure, not a silent gap.
  it("catches a required date that is absent", () => {
    expect(dateFindings(STATEMENT.split("2028-01-01").join("some time"))).toContain(
      "2028-01-01 is not stated beside 45 CFR 170.205(b)(1)",
    );
  });

  // SEEDED: a date present but detached from its section is still a failure.
  it("catches a date stated far from the section that sets it", () => {
    expect(dateFindings("2028-01-01 is a date.\n\n45 CFR 170.205(b)(1) is a section.")).toContain(
      "2028-01-01 is not stated beside 45 CFR 170.205(b)(1)",
    );
  });
});

describe("a recognized-but-undecoded stamp is stated as such", () => {
  it("states F6, what a message carrying it does, and the date it becomes the only option", () => {
    expect(STATEMENT).toContain("NCPDP_TELECOM_VF6_NOT_DECODED");
    const f6 = ROWS.find((r) => r.version === "F6");
    expect(f6?.status).toBe("recognized, not decoded");
    expect(
      units(stripCode(STATEMENT)).some((u) => u.includes("F6") && u.includes("2028-04-14")),
    ).toBe(true);
  });

  // SEEDED: listing the undecoded stamp among the decoded versions.
  it("catches F6 listed as decoded", () => {
    const promoted = parseStatementRows(
      "| Telecom | `F6` | decoded | 45 CFR 162.1102(e)(2)(i) | n/a | none |",
    );
    expect(versionSetFindings(promoted, [], STAMPS)).toContain(
      "Telecom F6: listed among the decoded versions, and it is not decoded",
    );
  });
});

describe("the citation set is closed", () => {
  it("cites only the allowed sections, the two public URLs and files in this repository", () => {
    expect(citationFindings(STATEMENT, fileExists)).toEqual([]);
  });

  it("records that the Implementation Guides are a purchased product", () => {
    expect(STATEMENT).toMatch(/purchased product/i);
  });

  // SEEDED: a CFR section outside the set.
  it("catches a CFR citation outside the allowed set", () => {
    expect(citationFindings("See 21 CFR 1308.12 for the schedule.", fileExists)).toContain(
      'citation "21 CFR 1308.12" is outside the allowed set',
    );
  });

  // SEEDED: an outside URL, which is how unlicensed prose would arrive.
  it("catches a URL outside the allowed set", () => {
    expect(
      citationFindings("Copied from <https://example.com/ncpdp-guide>.", fileExists),
    ).toContain('citation "https://example.com/ncpdp-guide" is outside the allowed set');
  });

  // SEEDED: a repo-relative link that points at nothing.
  it("catches a relative link to a file that does not exist", () => {
    expect(citationFindings("See [gone](./not-a-real-page.md).", fileExists)).toContain(
      'relative link "./not-a-real-page.md" resolves to no file in this repository',
    );
  });
});

describe("the statement does not imply certification", () => {
  it("says no third party has tested this package, and what stands in", () => {
    expect(honestyFindings(STATEMENT)).toEqual([]);
  });

  it("carries no overclaim of its own", () => {
    expect(overclaimFindings(STATEMENT)).toEqual([]);
  });

  // SEEDED: each forbidden assertion, fed to the checker one at a time.
  it("rejects a claim that this package is certified", () => {
    expect(overclaimFindings("@cosyte/ncpdp is certified by NCPDP.").join(" ")).toContain(
      "overclaim (certified)",
    );
  });

  it("rejects a claim that this package is conformance-tested", () => {
    expect(
      overclaimFindings("This package is conformance-tested against the standard.").join(" "),
    ).toContain("overclaim (conformance-tested)");
  });

  it("rejects a claim that a third party verified the decode", () => {
    expect(
      overclaimFindings("The Telecom decode has been verified by a third party.").join(" "),
    ).toContain("overclaim (third-party-verified)");
  });

  it("rejects a claim of byte-for-byte agreement with a named switch", () => {
    const findings = overclaimFindings("Output is byte-for-byte compatible with the Acme switch.");
    expect(findings.join(" ")).toContain("overclaim (byte-for-byte)");
    expect(findings.join(" ")).toContain("overclaim (vendor-parity)");
  });

  // SEEDED: the denials the statement actually makes must survive the same rule.
  it("does not flag a denial of the same claim", () => {
    expect(
      overclaimFindings("No third party has tested this package, and it is not certified."),
    ).toEqual([]);
    expect(
      overclaimFindings("Do not assume byte-for-byte agreement with any vendor implementation."),
    ).toEqual([]);
  });

  // SEEDED: the honesty section with a required fact removed.
  it("catches an honesty section that drops the testing tool's target version", () => {
    expect(honestyFindings(STATEMENT.split("SCRIPT v10.6").join("some version"))).toContain(
      "the statement does not say: the ONC/NIST tool targets SCRIPT v10.6",
    );
  });
});

describe("one document is the source of truth, and it is one hop away", () => {
  it("leaves no restated version set anywhere else on the published surface", () => {
    expect(deferralFindings(SURFACE, KNOWN_SCRIPT_VERSIONS)).toEqual([]);
  });

  it("is linked from the README", () => {
    const readme = SURFACE.get("README.md") ?? "";
    expect(linkTargets(readme).some((t) => pointsAtStatement("README.md", t))).toBe(true);
  });

  it("is listed in the documentation sidebar", () => {
    expect(sidebarDocIds(SIDEBARS)).toContain(STATEMENT_DOC_ID);
  });

  it("is one document rather than a pointer to four", () => {
    for (const section of ["45 CFR 170.205", "45 CFR 162.1102", "45 CFR 162.1202"]) {
      expect(STATEMENT).toContain(section);
    }
    for (const date of ["2028-01-01", "2027-08-14", "2028-04-14"]) {
      expect(STATEMENT).toContain(date);
    }
    expect(STATEMENT).toContain("NCPDP_TELECOM_VF6_NOT_DECODED");
    expect(STATEMENT).toContain("no third party has tested this package");
  });

  // SEEDED: a deferring page that re-adds the version set.
  it("catches a page that restates the version set", () => {
    const seeded = new Map(SURFACE);
    seeded.set("docs-content/intro.md", "SCRIPT v2017071 / v2023011 are supported.");
    expect(deferralFindings(seeded, KNOWN_SCRIPT_VERSIONS).join(" ")).toContain(
      "docs-content/intro.md: restates the decoded version set",
    );
  });

  // SEEDED: a deferring page that restates the Telecom scope instead.
  it("catches a page that restates the Telecom decode scope", () => {
    const seeded = new Map(SURFACE);
    seeded.set(
      "docs-content/spec-notes-telecom.md",
      "Telecom decodes vD.0 only.\n\n[Conformance](./conformance)",
    );
    expect(deferralFindings(seeded, KNOWN_SCRIPT_VERSIONS).join(" ")).toContain(
      "docs-content/spec-notes-telecom.md: restates the decoded version set",
    );
  });

  // SEEDED: a deferring page that drops its one-hop link.
  it("catches a deferring page with no link to the statement", () => {
    const seeded = new Map(SURFACE);
    seeded.set("docs-content/intro.md", "Nothing to see here.");
    expect(deferralFindings(seeded, KNOWN_SCRIPT_VERSIONS)).toContain(
      "docs-content/intro.md: carries no one-hop link to the conformance statement",
    );
  });

  // SEEDED: a version identifier inside a sample message is data, not a claim.
  it("does not flag a version identifier inside a fenced code block", () => {
    const seeded = new Map(SURFACE);
    seeded.set(
      "docs-content/quickstart.md",
      "```ts\nparseScript('<Message version=\"2017071\"/>');\nparseScript('<Message version=\"2023011\"/>');\n```",
    );
    expect(deferralFindings(seeded, KNOWN_SCRIPT_VERSIONS)).toEqual([]);
  });
});
