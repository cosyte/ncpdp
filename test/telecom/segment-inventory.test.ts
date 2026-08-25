import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseTelecom,
  serializeTelecom,
  tokenizeBody,
  SEGMENT_ABSENCES,
  SEGMENT_CODE_RANGES,
  SEGMENT_NAMES,
  TELECOM_WARNING_CODES,
  type NcpdpTelecomWarning,
  type SegmentCodeRange,
} from "../../src/telecom/index.js";
import { FS, RS, buildHeader, buildTransmission } from "../_helpers/build-telecom.js";

/**
 * The mechanical Segment Identification (111-AM) inventory guard.
 *
 * The rule it enforces is one sentence: A CODE INSIDE A RANGE THIS PACKAGE DECLARES
 * IS EITHER NAMED OR ACCOUNTED FOR. Before this suite the ranges lived in a source
 * comment, neither was filled, and nothing failed when a hole appeared, so a consumer
 * meeting `06` could not tell "no such segment exists" from "this library did not
 * model it" from "nobody read an artifact that would settle it".
 *
 * Four rules, all checked against the tree rather than against a reviewer's memory:
 *
 *  1. Every code inside a declared range is named by `SEGMENT_NAMES` or carries a
 *     `SEGMENT_ABSENCES` record, and no code is both.
 *  2. A declared range does not present its bounds as established. `boundsVerified`
 *     may only be `true` where a `segment-range-source:` record sits beside the
 *     declaration, which is the shape the vocabulary tables already use.
 *  3. The 19 names this package shipped before this suite existed still ship, exactly
 *     as they were. An accounting of absence must never become licence to invent a
 *     label, so the names are pinned here rather than left to a reviewer to notice.
 *  4. Every `docs-content/` document that enumerates 111-AM codes enumerates exactly
 *     the codes the inventory names, and the failure names the differing codes.
 *
 * THE CHECKS ARE PURE FUNCTIONS OVER THEIR INPUTS, AND EVERY RULE HAS A SEEDED
 * COUNTEREXAMPLE. Asserting that today's inventory is clean proves nothing about a
 * withdrawal tomorrow: a check that keyed on "is this code unnamed" would go quiet
 * the moment a name was removed, which is the exact failure this suite exists to
 * prevent. So each rule is exercised against a seeded input that must produce a
 * finding, and the parsers prove on every run that they can still see their subject.
 *
 * WHAT IT DELIBERATELY CANNOT SEE. The doc pass matches this repo's house phrasing
 * for a code enumeration plus its scope clause, and treats a backticked 2-digit code
 * followed by a capitalized word as a naming claim. A document that enumerates codes
 * in some third shape is not read as an enumeration; the naming-pair rule is what
 * keeps that from being silent, because a pair outside a declared block is itself a
 * finding. Read a green run as "no document of these shapes disagrees", never as "no
 * document can disagree".
 */

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DOCS_DIR = join(REPO_ROOT, "docs-content");
const INVENTORY_SOURCE = readFileSync(
  join(REPO_ROOT, "src", "telecom", "segment-inventory.ts"),
  "utf8",
);

/** The reason tokens an absence record may carry: a closed control vocabulary. */
const ABSENCE_REASONS: ReadonlySet<string> = new Set(["unsourced"]);

/**
 * An absence record as the checks read one. Deliberately wider than `SegmentAbsence`,
 * so a seeded record carrying a reason outside the closed vocabulary can be handed to
 * the checker without an assertion that would hide the very thing under test.
 */
interface AbsenceLike {
  readonly reason: string;
}

/** Every 2-character code a declared range covers, in order. */
function codesIn(range: SegmentCodeRange): string[] {
  if (!/^\d{2}$/.test(range.first) || !/^\d{2}$/.test(range.last)) return [];
  const out: string[] = [];
  for (let code = Number(range.first); code <= Number(range.last); code += 1) {
    out.push(String(code).padStart(2, "0"));
  }
  return out;
}

/** Rule 1: every code in a declared range is named or accounted for, never both. */
function inventoryFindings(
  names: ReadonlyMap<string, string>,
  ranges: readonly SegmentCodeRange[],
  absences: ReadonlyMap<string, AbsenceLike>,
): string[] {
  const findings: string[] = [];
  const covered = new Set<string>();

  for (const range of ranges) {
    const span = `${range.group} range ${range.first}-${range.last}`;
    for (const code of codesIn(range)) {
      covered.add(code);
      const named = names.has(code);
      const accounted = absences.has(code);
      if (!named && !accounted) {
        findings.push(`${code}: inside the declared ${span}, neither named nor accounted for`);
      }
      if (named && accounted) {
        findings.push(`${code}: named and recorded absent at the same time`);
      }
    }
  }

  for (const [code, absence] of absences) {
    if (!covered.has(code)) {
      findings.push(`${code}: an absence record for a code outside every declared range`);
    }
    if (!ABSENCE_REASONS.has(absence.reason)) {
      findings.push(`${code}: absence record carries no reason from the closed vocabulary`);
    }
  }
  return findings;
}

/** Rule 2: a range may only claim verified bounds where a source record backs it. */
function rangeFindings(ranges: readonly SegmentCodeRange[], source: string): string[] {
  const findings: string[] = [];
  for (const range of ranges) {
    const span = `${range.group} range ${range.first}-${range.last}`;
    if (!/^\d{2}$/.test(range.first) || !/^\d{2}$/.test(range.last)) {
      findings.push(`${span}: a bound that is not a 2-character code`);
    } else if (Number(range.first) > Number(range.last)) {
      findings.push(`${span}: declared backwards`);
    }
    if (range.boundsVerified && !source.includes(`segment-range-source: group=${range.group}`)) {
      findings.push(`${span}: bounds presented as established with no segment-range-source record`);
    }
  }
  return findings;
}

/**
 * Rule 2, second half: the inventory ships tokens, never prose. Any string reachable
 * from the published inventory has to be a 2-character code or a declared token, so a
 * segment name cannot arrive here under a field called something other than a label.
 */
function smuggledStrings(
  ranges: readonly unknown[],
  absences: ReadonlyMap<string, unknown>,
): string[] {
  const allowed = new Set<string>(["request", "response", ...ABSENCE_REASONS]);
  const findings: string[] = [];
  const check = (where: string, value: unknown): void => {
    if (typeof value !== "string") return;
    if (/^\d{2}$/.test(value) || allowed.has(value)) return;
    findings.push(`${where}: free-form string "${value}" in the published inventory`);
  };
  const fields = (value: unknown): [string, unknown][] =>
    typeof value === "object" && value !== null ? Object.entries(value) : [];
  for (const range of ranges) {
    for (const [key, value] of fields(range)) check(`range.${key}`, value);
  }
  for (const [code, absence] of absences) {
    check(`absence ${code}`, code);
    for (const [key, value] of fields(absence)) check(`absence ${code}.${key}`, value);
  }
  return findings;
}

/** How a `docs-content/` paragraph declares what it enumerates. */
type DocScope = "request-complete" | "response-complete" | "subset" | "ranges" | "unnamed";

/** The closed set of scope clauses a naming enumeration may declare. */
const SCOPE_CLAUSES: ReadonlyMap<string, DocScope> = new Map([
  ["every request code this package names", "request-complete"],
  ["every response code this package names", "response-complete"],
  ["only those this page uses", "subset"],
]);

const NAMED_MARKER = /Segment Identification \(111-AM\) codes\b/;
const NAMED_LEAD = /Segment Identification \(111-AM\) codes paraphrased,\s+([^:]+?):/;
const RANGES_MARKER = /Declared 111-AM code ranges\b/;
const UNNAMED_MARKER = /Codes inside a declared 111-AM range that this package does not name\b/;
/** A backticked 2-digit code immediately followed by a capitalized word: a naming claim. */
const NAMING_PAIR = /`(\d{2})`\s+[A-Z]/g;
/** Any backticked 2-digit code. */
const ANY_CODE = /`(\d{2})`/g;

/** One enumerating paragraph of a `docs-content/` document. */
interface DocBlock {
  readonly file: string;
  readonly scope: DocScope | "unrecognized";
  /** Codes the paragraph attaches a name to. */
  readonly named: readonly string[];
  /** Every code the paragraph mentions, named or bare. */
  readonly mentioned: readonly string[];
}

/** Drop fenced code blocks: a snippet is code under test, not a claim about codes. */
function stripFences(markdown: string): string {
  return markdown.replace(/^```[\s\S]*?^```/gm, "");
}

function matchAll(text: string, re: RegExp): string[] {
  const out: string[] = [];
  const local = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let m = local.exec(text);
  while (m !== null) {
    out.push(m[1] ?? "");
    m = local.exec(text);
  }
  return out;
}

/**
 * Read one document into its enumerating paragraphs plus the naming claims it makes
 * outside any of them. A paragraph is the unit because that is what a reader sees as
 * one statement about the inventory.
 */
function readDoc(file: string, markdown: string): { blocks: DocBlock[]; stray: string[] } {
  const blocks: DocBlock[] = [];
  const stray: string[] = [];
  for (const para of stripFences(markdown).split(/\n\s*\n/)) {
    const named = matchAll(para, NAMING_PAIR);
    const mentioned = matchAll(para, ANY_CODE);
    if (NAMED_MARKER.test(para)) {
      const clause = NAMED_LEAD.exec(para)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
      blocks.push({ file, scope: SCOPE_CLAUSES.get(clause) ?? "unrecognized", named, mentioned });
    } else if (RANGES_MARKER.test(para)) {
      blocks.push({ file, scope: "ranges", named, mentioned });
    } else if (UNNAMED_MARKER.test(para)) {
      blocks.push({ file, scope: "unnamed", named, mentioned });
    } else {
      for (const code of named) stray.push(`${file}: names \`${code}\` outside a declared block`);
    }
  }
  return { blocks, stray };
}

function difference(a: readonly string[], b: readonly string[]): string[] {
  const other = new Set(b);
  return [...new Set(a)].filter((x) => !other.has(x)).sort();
}

/** Rules 4: the documents and the published inventory enumerate the same codes. */
function docFindings(
  blocks: readonly DocBlock[],
  stray: readonly string[],
  names: ReadonlyMap<string, string>,
  ranges: readonly SegmentCodeRange[],
  absences: ReadonlyMap<string, AbsenceLike>,
): string[] {
  const findings: string[] = [...stray];
  const namedInGroup = (group: string): string[] =>
    ranges
      .filter((r) => r.group === group)
      .flatMap(codesIn)
      .filter((code) => names.has(code))
      .sort();

  for (const block of blocks) {
    if (block.scope === "unrecognized") {
      findings.push(`${block.file}: enumerates 111-AM codes with no recognized scope clause`);
      continue;
    }
    if (block.scope === "ranges" || block.scope === "unnamed") {
      for (const code of block.named) {
        findings.push(`${block.file}: attaches a name to \`${code}\` in a ${block.scope} block`);
      }
      const expected =
        block.scope === "ranges"
          ? [...new Set(ranges.flatMap((r) => [r.first, r.last]))].sort()
          : [...absences.keys()].sort();
      for (const code of difference(expected, block.mentioned)) {
        findings.push(`${block.file}: ${block.scope} block omits \`${code}\``);
      }
      for (const code of difference(block.mentioned, expected)) {
        findings.push(
          `${block.file}: ${block.scope} block carries \`${code}\`, which does not belong`,
        );
      }
      continue;
    }
    for (const code of block.named) {
      if (!names.has(code)) {
        findings.push(`${block.file}: names \`${code}\`, which the inventory does not name`);
      }
    }
    if (block.scope === "subset") continue;
    const group = block.scope === "request-complete" ? "request" : "response";
    for (const code of difference(namedInGroup(group), block.named)) {
      findings.push(`${block.file}: omits \`${code}\`, which the inventory names`);
    }
  }

  for (const group of new Set(ranges.map((r) => r.group))) {
    const scope = group === "request" ? "request-complete" : "response-complete";
    if (!blocks.some((b) => b.scope === scope)) {
      findings.push(
        `docs-content/: no document enumerates every ${group} code the inventory names`,
      );
    }
  }
  if (!blocks.some((b) => b.scope === "ranges")) {
    findings.push("docs-content/: no document states the declared 111-AM ranges");
  }
  if (absences.size > 0 && !blocks.some((b) => b.scope === "unnamed")) {
    findings.push("docs-content/: no document says which codes inside a range carry no name");
  }
  return findings;
}

const DOC_FILES = readdirSync(DOCS_DIR)
  .filter((name) => name.endsWith(".md"))
  .sort()
  .map((name) => ({
    file: `docs-content/${name}`,
    text: readFileSync(join(DOCS_DIR, name), "utf8"),
  }));
const DOCS = DOC_FILES.map((doc) => readDoc(doc.file, doc.text));
const BLOCKS = DOCS.flatMap((d) => d.blocks);
const STRAY = DOCS.flatMap((d) => d.stray);

/** The 19 names this package published before the inventory existed, in wire order. */
const NAMES_AS_SHIPPED: readonly (readonly [string, string])[] = [
  ["01", "Patient"],
  ["02", "Pharmacy Provider"],
  ["03", "Prescriber"],
  ["04", "Insurance"],
  ["05", "Coordination of Benefits / Other Payments"],
  ["07", "Claim"],
  ["08", "DUR / PPS"],
  ["10", "Compound"],
  ["11", "Pricing"],
  ["12", "Prior Authorization"],
  ["13", "Clinical"],
  ["20", "Response Message"],
  ["21", "Response Status"],
  ["22", "Response Claim"],
  ["23", "Response Pricing"],
  ["24", "Response DUR / PPS"],
  ["25", "Response Insurance"],
  ["26", "Response Patient"],
  ["28", "Response Coordination of Benefits / Other Payers"],
];

describe("the guard can still see its subject", () => {
  it("expands a declared range into the codes it covers", () => {
    expect(codesIn({ group: "response", first: "20", last: "28", boundsVerified: false })).toEqual([
      "20",
      "21",
      "22",
      "23",
      "24",
      "25",
      "26",
      "27",
      "28",
    ]);
  });

  it("reads the enumerating paragraphs out of the shipped documents", () => {
    expect(BLOCKS.map((b) => `${b.file} ${b.scope}`).sort()).toEqual([
      "docs-content/spec-notes-telecom-compound-cob.md subset",
      "docs-content/spec-notes-telecom-response.md response-complete",
      "docs-content/spec-notes-telecom.md ranges",
      "docs-content/spec-notes-telecom.md request-complete",
      "docs-content/spec-notes-telecom.md unnamed",
    ]);
  });

  it("reads the codes out of a paragraph it matched", () => {
    const block = BLOCKS.find((b) => b.scope === "response-complete");
    expect(block?.named).toEqual(["20", "21", "22", "23", "24", "25", "26", "28"]);
  });
});

describe("every code in a declared range is named or accounted for", () => {
  it("finds no unaccounted code in the published inventory", () => {
    expect(inventoryFindings(SEGMENT_NAMES, SEGMENT_CODE_RANGES, SEGMENT_ABSENCES)).toEqual([]);
  });

  it("publishes an absence record, readable by a program, for each unnamed in-range code", () => {
    expect([...SEGMENT_ABSENCES.keys()].sort()).toEqual(["06", "09", "14", "15", "16", "27"]);
    for (const [code, absence] of SEGMENT_ABSENCES) {
      expect(ABSENCE_REASONS.has(absence.reason), `${code} carries a known reason`).toBe(true);
    }
  });

  // SEEDED: a name withdrawn with no absence record put in its place. Without this the
  // suite cannot tell "nothing is unaccounted" from "the rule went quiet on withdrawal".
  it("reports a withdrawn name as unaccounted for rather than passing", () => {
    const withdrawn = new Map(SEGMENT_NAMES);
    withdrawn.delete("13");
    expect(inventoryFindings(withdrawn, SEGMENT_CODE_RANGES, SEGMENT_ABSENCES)).toEqual([
      "13: inside the declared request range 01-16, neither named nor accounted for",
    ]);
  });

  // SEEDED: the same withdrawal, with the accounting a withdrawal owes.
  it("passes a withdrawn name once an absence record accounts for it", () => {
    const withdrawn = new Map(SEGMENT_NAMES);
    withdrawn.delete("13");
    const accounted = new Map(SEGMENT_ABSENCES);
    accounted.set("13", { reason: "unsourced" });
    expect(inventoryFindings(withdrawn, SEGMENT_CODE_RANGES, accounted)).toEqual([]);
  });

  // SEEDED: an absence record for a code the table also names is a contradiction.
  it("catches a code that is named and recorded absent at once", () => {
    const both = new Map(SEGMENT_ABSENCES);
    both.set("07", { reason: "unsourced" });
    expect(inventoryFindings(SEGMENT_NAMES, SEGMENT_CODE_RANGES, both)).toEqual([
      "07: named and recorded absent at the same time",
    ]);
  });

  // SEEDED: an absence record for a code no declared range covers claims a hole that
  // does not exist, which is the same defect pointing the other way.
  it("catches an absence record outside every declared range", () => {
    const stray = new Map(SEGMENT_ABSENCES);
    stray.set("99", { reason: "unsourced" });
    expect(inventoryFindings(SEGMENT_NAMES, SEGMENT_CODE_RANGES, stray)).toEqual([
      "99: an absence record for a code outside every declared range",
    ]);
  });

  // SEEDED: a reason outside the closed vocabulary is not a reason this repo can cite.
  it("catches an absence record whose reason is not a declared token", () => {
    const invented = new Map<string, AbsenceLike>(SEGMENT_ABSENCES);
    invented.set("06", { reason: "everyone knows" });
    expect(inventoryFindings(SEGMENT_NAMES, SEGMENT_CODE_RANGES, invented)).toEqual([
      "06: absence record carries no reason from the closed vocabulary",
    ]);
  });
});

describe("a declared range does not present its bounds as established", () => {
  it("declares both ranges unverified, and finds nothing wrong with them", () => {
    expect(SEGMENT_CODE_RANGES.map((r) => r.boundsVerified)).toEqual([false, false]);
    expect(rangeFindings(SEGMENT_CODE_RANGES, INVENTORY_SOURCE)).toEqual([]);
  });

  it("carries the caveat beside the declaration, not only in a reviewer's memory", () => {
    expect(INVENTORY_SOURCE).toContain("boundsVerified: false");
    expect(INVENTORY_SOURCE).toContain("segment-range-source:");
  });

  // SEEDED: bounds flipped to established with nothing behind them.
  it("catches a range claiming verified bounds with no source record", () => {
    const claimed: SegmentCodeRange[] = [
      { group: "request", first: "01", last: "16", boundsVerified: true },
    ];
    expect(rangeFindings(claimed, INVENTORY_SOURCE)).toEqual([
      "request range 01-16: bounds presented as established with no segment-range-source record",
    ]);
  });

  it("accepts verified bounds once a source record sits beside the declaration", () => {
    const claimed: SegmentCodeRange[] = [
      { group: "request", first: "01", last: "16", boundsVerified: true },
    ];
    const sourced = `${INVENTORY_SOURCE}\n// segment-range-source: group=request artifact: seeded`;
    expect(rangeFindings(claimed, sourced)).toEqual([]);
  });

  // SEEDED: a backwards range would make its own coverage claim unfalsifiable.
  it("catches a range declared backwards", () => {
    const backwards: SegmentCodeRange[] = [
      { group: "response", first: "28", last: "20", boundsVerified: false },
    ];
    expect(rangeFindings(backwards, INVENTORY_SOURCE)).toEqual([
      "response range 28-20: declared backwards",
    ]);
  });

  it("ships tokens and codes, never a free-form string that could be a name", () => {
    expect(smuggledStrings(SEGMENT_CODE_RANGES, SEGMENT_ABSENCES)).toEqual([]);
  });

  // SEEDED: an accounting of absence must never become a second naming table.
  it("catches a name smuggled into the inventory under another field", () => {
    const smuggled = new Map<string, unknown>();
    smuggled.set("06", { reason: "unsourced", note: "Workers Compensation" });
    expect(smuggledStrings([], smuggled)).toEqual([
      'absence 06.note: free-form string "Workers Compensation" in the published inventory',
    ]);
  });
});

describe("the names this package already shipped are unchanged", () => {
  it("carries exactly the 19 codes it carried before, each with its existing name", () => {
    expect([...SEGMENT_NAMES.entries()]).toEqual(NAMES_AS_SHIPPED);
  });

  it("names no code that carries an absence record", () => {
    for (const code of SEGMENT_ABSENCES.keys()) {
      expect(SEGMENT_NAMES.has(code), `${code} is unnamed`).toBe(false);
    }
  });
});

describe("an unnamed segment is preserved verbatim and warned, never dropped", () => {
  const unnamedSegment = (code: string): string =>
    buildTransmission({ transactionCode: "B1" }, [
      [
        { id: "07", fields: [["D2", "RX0000009"]] },
        {
          id: code,
          fields: [
            ["ZA", "SYNTHVALUE1"],
            ["ZB", "SYNTHVALUE2"],
            ["ZA", "SYNTHVALUE3"],
          ],
        },
      ],
    ]);

  for (const [code, where] of [
    ["06", "inside the declared request range"],
    ["99", "outside every declared range"],
  ] as const) {
    it(`preserves every field of an unnamed segment ${where} and warns`, () => {
      const raw = unnamedSegment(code);
      const t = parseTelecom(raw);
      const seg = t.segments[1];

      expect(seg?.segmentId).toBe(code);
      expect(seg?.name).toBeUndefined();
      expect(seg?.fields.map((f) => [f.id, f.value])).toEqual([
        ["ZA", "SYNTHVALUE1"],
        ["ZB", "SYNTHVALUE2"],
        ["ZA", "SYNTHVALUE3"],
      ]);
      expect(t.warnings.map((w) => w.code)).toEqual([TELECOM_WARNING_CODES.UNKNOWN_SEGMENT]);
      // Nothing was dropped or reordered, so the transmission still round-trips byte
      // for byte: the strongest available statement of "verbatim, in wire order".
      expect(serializeTelecom(t)).toBe(raw);
    });
  }

  it("warns identically whether or not the code carries an absence record", () => {
    const inRange = parseTelecom(unnamedSegment("06"));
    const outOfRange = parseTelecom(unnamedSegment("99"));
    expect(SEGMENT_ABSENCES.has("06")).toBe(true);
    expect(SEGMENT_ABSENCES.has("99")).toBe(false);
    expect(inRange.warnings.map((w) => w.code)).toEqual(outOfRange.warnings.map((w) => w.code));
  });
});

describe("an absent or malformed segment id consults no absence record", () => {
  it("preserves a segment that does not begin with AM and warns that the id is missing", () => {
    const raw = `${buildHeader()}D2RX0000010${FS}ZZSYNTHTAIL`;
    const t = parseTelecom(raw);

    expect(t.segments[0]?.segmentId).toBe("");
    expect(t.segments[0]?.fields.map((f) => [f.id, f.value])).toEqual([
      ["D2", "RX0000010"],
      ["ZZ", "SYNTHTAIL"],
    ]);
    expect(t.warnings.map((w) => w.code)).toEqual([TELECOM_WARNING_CODES.MISSING_SEGMENT_ID]);
    expect(serializeTelecom(t)).toBe(raw);
  });

  it("preserves an AM value that is not 2 characters and warns that it is malformed", () => {
    const raw = `${buildHeader()}AM07D2RX0000011${RS}AM0`;
    const t = parseTelecom(raw);

    expect(t.segments.map((s) => s.segmentId)).toEqual(["", ""]);
    expect(t.segments[0]?.fields.map((f) => [f.id, f.value])).toEqual([["AM", "07D2RX0000011"]]);
    expect(t.segments[1]?.fields.map((f) => [f.id, f.value])).toEqual([["AM", "0"]]);
    expect(t.warnings.map((w) => w.code)).toEqual([
      TELECOM_WARNING_CODES.MALFORMED_SEGMENT_ID,
      TELECOM_WARNING_CODES.MALFORMED_SEGMENT_ID,
    ]);
    expect(serializeTelecom(t)).toBe(raw);
  });

  it("looks up no absence record for a value that is not a 2-character code", () => {
    // The inventory is keyed by 2-character codes and a range expands to nothing else,
    // so a malformed or absent id can never be reported as an unaccounted hole.
    for (const value of ["", "0", "07D2RX0000011"]) {
      expect(SEGMENT_ABSENCES.has(value)).toBe(false);
      expect(SEGMENT_CODE_RANGES.flatMap(codesIn)).not.toContain(value);
    }
    const warnings: NcpdpTelecomWarning[] = [];
    const segs = tokenizeBody(`AM${FS}D7SYNTH`, 56, warnings);
    expect(segs[0]?.fields.map((f) => f.value)).toEqual(["", "SYNTH"]);
    expect(warnings.map((w) => w.code)).toContain(TELECOM_WARNING_CODES.MALFORMED_SEGMENT_ID);
    expect(warnings.map((w) => w.code)).not.toContain(TELECOM_WARNING_CODES.UNKNOWN_SEGMENT);
  });
});

describe("the documents and the published inventory enumerate the same codes", () => {
  it("finds no drift between docs-content/ and the inventory", () => {
    expect(
      docFindings(BLOCKS, STRAY, SEGMENT_NAMES, SEGMENT_CODE_RANGES, SEGMENT_ABSENCES),
    ).toEqual([]);
  });

  // SEEDED: the drift this suite was written for. `12` Prior Authorization was in the
  // table and missing from the request page for four releases.
  it("catches a document that omits a code the inventory names, and says which", () => {
    const { blocks, stray } = readDoc(
      "docs-content/seeded.md",
      "Segment Identification (111-AM) codes paraphrased, every request code this package names: `01` Patient, `13` Clinical.",
    );
    const findings = docFindings(
      blocks,
      stray,
      SEGMENT_NAMES,
      SEGMENT_CODE_RANGES,
      SEGMENT_ABSENCES,
    );
    expect(findings).toContain("docs-content/seeded.md: omits `12`, which the inventory names");
    expect(findings).toContain("docs-content/seeded.md: omits `07`, which the inventory names");
  });

  // SEEDED: a page naming a code the package does not name is how an invented label
  // would reach a reader, and it is the failure this item exists to prevent.
  it("catches a document that names a code the inventory does not", () => {
    const { blocks, stray } = readDoc(
      "docs-content/seeded.md",
      "Segment Identification (111-AM) codes paraphrased, only those this page uses: `06` Workers Compensation.",
    );
    expect(
      docFindings(blocks, stray, SEGMENT_NAMES, SEGMENT_CODE_RANGES, SEGMENT_ABSENCES),
    ).toContain("docs-content/seeded.md: names `06`, which the inventory does not name");
  });

  // SEEDED: an enumeration that declares no scope could claim any subset it liked.
  it("catches an enumeration with no recognized scope clause", () => {
    const { blocks, stray } = readDoc(
      "docs-content/seeded.md",
      "Segment Identification (111-AM) codes paraphrased: `01` Patient, `07` Claim.",
    );
    expect(
      docFindings(blocks, stray, SEGMENT_NAMES, SEGMENT_CODE_RANGES, SEGMENT_ABSENCES),
    ).toContain("docs-content/seeded.md: enumerates 111-AM codes with no recognized scope clause");
  });

  // SEEDED: a new page that names codes in some shape of its own does not escape.
  it("catches a naming claim made outside any declared block", () => {
    const { blocks, stray } = readDoc(
      "docs-content/seeded.md",
      "The reader also handles `14` Workers Compensation on request transmissions.",
    );
    expect(
      docFindings(blocks, stray, SEGMENT_NAMES, SEGMENT_CODE_RANGES, SEGMENT_ABSENCES),
    ).toContain("docs-content/seeded.md: names `14` outside a declared block");
  });

  // SEEDED: the hole story is part of the contract, not decoration.
  it("catches an unnamed block that has gone stale against the absence records", () => {
    const { blocks, stray } = readDoc(
      "docs-content/seeded.md",
      "Codes inside a declared 111-AM range that this package does not name: `06`, `09`.",
    );
    const findings = docFindings(
      blocks,
      stray,
      SEGMENT_NAMES,
      SEGMENT_CODE_RANGES,
      SEGMENT_ABSENCES,
    );
    expect(findings).toContain("docs-content/seeded.md: unnamed block omits `27`");
  });

  // SEEDED: a stated range that disagrees with the declared one.
  it("catches a ranges block that disagrees with the declared ranges", () => {
    const { blocks, stray } = readDoc(
      "docs-content/seeded.md",
      "Declared 111-AM code ranges: `01` to `13` on the request side and `20` to `28` on the response side.",
    );
    const findings = docFindings(
      blocks,
      stray,
      SEGMENT_NAMES,
      SEGMENT_CODE_RANGES,
      SEGMENT_ABSENCES,
    );
    expect(findings).toContain("docs-content/seeded.md: ranges block omits `16`");
    expect(findings).toContain(
      "docs-content/seeded.md: ranges block carries `13`, which does not belong",
    );
  });

  // SEEDED: deleting the page that carries a side of the inventory is drift too.
  it("catches docs-content that stops enumerating a side of the inventory", () => {
    const findings = docFindings([], [], SEGMENT_NAMES, SEGMENT_CODE_RANGES, SEGMENT_ABSENCES);
    expect(findings).toEqual([
      "docs-content/: no document enumerates every request code the inventory names",
      "docs-content/: no document enumerates every response code the inventory names",
      "docs-content/: no document states the declared 111-AM ranges",
      "docs-content/: no document says which codes inside a range carry no name",
    ]);
  });

  it("reads a fenced snippet as code under test, never as a claim about codes", () => {
    const { blocks, stray } = readDoc(
      "docs-content/seeded.md",
      ["```ts", 'const code = "`14` Workers Compensation";', "```"].join("\n"),
    );
    expect(blocks).toEqual([]);
    expect(stray).toEqual([]);
  });
});
