import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as telecom from "../../src/telecom/index.js";

/**
 * The mechanical vocabulary-provenance guard.
 *
 * Three rules, all checked against the tree rather than against a reviewer's memory:
 *
 *  1. A shipped code-to-label mapping carries a provenance record beside its
 *     declaration: the artifact, an ISO retrieval date, the artifact's sha256, the
 *     derivation method, a negative control that was run, and the single-source
 *     caveat where the artifact is not normative for the standard.
 *  2. KNOWN-LIMITATIONS.md and the exported surface agree, in BOTH directions,
 *     about whether a table exists at all for each wire field.
 *  3. A shipped label stays a short paraphrase. The repo does not redistribute
 *     NCPDP prose, and a transcribed definition is what that would look like.
 *
 * THE GUARD PROVES ON EVERY RUN THAT IT CAN STILL SEE ITS SUBJECT. Each rule has a
 * seeded counterexample below that the checker must catch. A guard whose parser has
 * silently stopped matching passes quietly forever otherwise, which is the failure
 * mode that makes a green run worth nothing.
 *
 * WHAT IT DELIBERATELY CANNOT SEE, because claiming otherwise here would be the same
 * defect in a different place. The enumerator matches `export const X: ReadonlyMap<...>
 * = new Map([...])` across every file under `src/`, with no exclusion list. That is the
 * shape every wire-code-keyed table in this package uses today, and it is NOT a general
 * detector for "a mapping". Three known holes, none of them closed by this pass:
 *
 *  - A table shipped as a frozen object literal, built at runtime, or read from a data
 *    file is not enumerated at all.
 *  - A module-private `const` is not enumerated. `src/common/code-system.ts` has one,
 *    and it maps a SCRIPT qualifier onto a closed normalized-system union this library
 *    owns rather than onto a human-readable label, which is why leaving it out is a
 *    scope decision and not an oversight. It is still a hole in the sweep.
 *  - The deferrals below are enumerated and then set aside by name.
 *
 * Widen the enumerator when a table arrives in a new shape. Do not read a green run as
 * "no unsourced label can ship"; read it as "no declaration of this shape ships one".
 */

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SRC_DIR = join(REPO_ROOT, "src");

/**
 * Declarations this pass enumerates and deliberately does not judge yet, each with the
 * reason. This is applied AFTER the sweep, never to the sweep: the enumerator still
 * lists every declaration in `src/`, and an entry here that matches nothing is a
 * finding, so the list cannot rot into an allow-list nobody reads.
 */
const DEFERRED: readonly { readonly name: string; readonly reason: string }[] = [
  {
    name: "SEGMENT_NAMES",
    reason:
      "Segment Identification (111-AM) naming vocabulary. A separate pass sources or withdraws it; this one covers the four wire-code label tables only.",
  },
  {
    name: "FIELD_NAMES",
    reason:
      "Field-id naming vocabulary for the tokenizer. Names a field, does not decode a wire code into a meaning, and is out of this pass's subject.",
  },
];

/** A `export const NAME: ReadonlyMap<...> = new Map([...])` declaration in `src/`. */
interface MapDeclaration {
  readonly file: string;
  readonly name: string;
  /** The contiguous `//` block immediately above, comment markers stripped. */
  readonly record: string;
  /** The text between `new Map(` and its matching `)`. */
  readonly body: string;
}

/** The machine-readable header line of a provenance record. */
interface ProvenanceHeader {
  readonly kind: "label-table" | "not-a-label-table";
  readonly field: string;
  readonly singleSource: boolean;
  readonly closedVocabulary: readonly string[];
}

/** One row of the vocabulary table in KNOWN-LIMITATIONS.md. */
interface DocRow {
  readonly field: string;
  readonly ships: boolean;
  readonly exportName: string;
}

function listTypeScriptFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTypeScriptFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out.sort();
}

/**
 * Walk forward from `open` (the index of a `(` or `[`) to its matching close, skipping
 * over string literals so a bracket inside a label never miscounts.
 */
function matchBracket(text: string, open: number): number {
  const closers: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const opener = text[open] ?? "";
  const closer = closers[opener] ?? "";
  let depth = 0;
  let quote = "";
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    if (quote !== "") {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === opener) depth += 1;
    else if (ch === closer) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** The contiguous `//` comment block immediately above `index`, markers stripped. */
function recordAbove(source: string, index: number): string {
  const before = source.slice(0, index).split("\n");
  before.pop();
  const lines: string[] = [];
  for (let i = before.length - 1; i >= 0; i -= 1) {
    const line = (before[i] ?? "").trim();
    if (!line.startsWith("//")) break;
    lines.unshift(line.replace(/^\/\/ ?/, ""));
  }
  return lines.join("\n");
}

function extractMapDeclarations(file: string, source: string): MapDeclaration[] {
  const out: MapDeclaration[] = [];
  const re = /export const (\w+)\s*:\s*ReadonlyMap<[^=]*>\s*=\s*new Map\(/g;
  let m = re.exec(source);
  while (m !== null) {
    const openParen = re.lastIndex - 1;
    const close = matchBracket(source, openParen);
    out.push({
      file,
      name: m[1] ?? "",
      record: recordAbove(source, m.index),
      body: close < 0 ? "" : source.slice(openParen + 1, close),
    });
    m = re.exec(source);
  }
  return out;
}

/** Every double-quoted string literal in `text`, in order. */
function stringLiterals(text: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m = re.exec(text);
  while (m !== null) {
    out.push(m[1] ?? "");
    m = re.exec(text);
  }
  return out;
}

/** Split a `new Map([...])` body into entries; per entry the key is the first literal. */
function parseEntries(body: string): { readonly key: string; readonly values: string[] }[] {
  const arrayStart = body.indexOf("[");
  if (arrayStart < 0) return [];
  const arrayEnd = matchBracket(body, arrayStart);
  if (arrayEnd < 0) return [];
  const inner = body.slice(arrayStart + 1, arrayEnd);

  const entries: { key: string; values: string[] }[] = [];
  let quote = "";
  let depth = 0;
  let start = -1;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i] ?? "";
    if (quote !== "") {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "[") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "]") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const literals = stringLiterals(inner.slice(start, i + 1));
        entries.push({ key: literals[0] ?? "", values: literals.slice(1) });
        start = -1;
      }
    }
  }
  return entries;
}

function parseHeader(record: string): ProvenanceHeader | undefined {
  const m = /vocab-provenance:\s*(label-table|not-a-label-table)([\s\S]*?)(?:\n\S|\n\n|$)/.exec(
    record,
  );
  if (m === null) return undefined;
  const kind = m[1] === "label-table" ? "label-table" : "not-a-label-table";
  const rest = m[2] ?? "";
  const field = /field=([\w-]+)/.exec(rest)?.[1] ?? "";
  const vocab = /closed-vocabulary=([\w|]+)/.exec(rest)?.[1] ?? "";
  return {
    kind,
    field,
    singleSource: /single-source=true/.test(rest),
    closedVocabulary: vocab === "" ? [] : vocab.split("|"),
  };
}

/** Every `vocab-withdrawn: field=<id>` record anywhere in a source file. */
function parseWithdrawnFields(source: string): string[] {
  const out: string[] = [];
  const re = /vocab-withdrawn:\s*field=([\w-]+)/g;
  let m = re.exec(source);
  while (m !== null) {
    out.push(m[1] ?? "");
    m = re.exec(source);
  }
  return out;
}

const SHORT_LABEL_MAX_CHARS = 48;
const SHORT_LABEL_MAX_WORDS = 6;

function labelFindings(name: string, label: string): string[] {
  const findings: string[] = [];
  if (label.length > SHORT_LABEL_MAX_CHARS) {
    findings.push(
      `${name}: label "${label}" is ${String(label.length)} chars, over the short-label bound`,
    );
  }
  if (label.trim().split(/\s+/).length > SHORT_LABEL_MAX_WORDS) {
    findings.push(`${name}: label "${label}" is longer than a short phrase`);
  }
  if (/\.\s|\.$/.test(label)) {
    findings.push(`${name}: label "${label}" reads as a transcribed sentence, not a paraphrase`);
  }
  return findings;
}

/** Rule 1 and rule 3: every enumerated declaration is classified, sourced and short. */
function declarationFindings(
  declarations: readonly MapDeclaration[],
  deferred: readonly { readonly name: string; readonly reason: string }[],
): string[] {
  const findings: string[] = [];
  const deferredNames = new Set(deferred.map((d) => d.name));

  for (const decl of declarations) {
    if (deferredNames.has(decl.name)) continue;
    const header = parseHeader(decl.record);
    if (header === undefined) {
      findings.push(
        `${decl.name} (${decl.file}): a code-keyed map ships with no vocab-provenance record beside it`,
      );
      continue;
    }
    if (header.field === "") {
      findings.push(`${decl.name}: vocab-provenance record names no wire field`);
    }

    const entries = parseEntries(decl.body);
    if (entries.length === 0) {
      findings.push(`${decl.name}: declared as a table but carries no entries`);
    }

    if (header.kind === "label-table") {
      for (const marker of ["artifact:", "retrieved:", "method:", "negative-control:"]) {
        if (!decl.record.includes(marker)) {
          findings.push(`${decl.name}: provenance record is missing "${marker}"`);
        }
      }
      if (!/retrieved:\s*\d{4}-\d{2}-\d{2}/.test(decl.record)) {
        findings.push(`${decl.name}: provenance record carries no ISO retrieval date`);
      }
      if (!/sha256:\s*[0-9a-f]{64}/.test(decl.record)) {
        findings.push(`${decl.name}: provenance record does not pin the artifact by sha256`);
      }
      if (header.singleSource && !decl.record.includes("caveat:")) {
        findings.push(
          `${decl.name}: single-source table ships without the caveat that goes with it`,
        );
      }
      for (const entry of entries) {
        if (entry.values.length !== 1) {
          findings.push(`${decl.name}: entry "${entry.key}" is not a plain code-to-label pair`);
          continue;
        }
        findings.push(...labelFindings(decl.name, entry.values[0] ?? ""));
      }
    } else {
      // A declaration that is NOT a label table may only carry values from a closed
      // control vocabulary it declares. This is what stops the escape hatch from
      // becoming a route to ship an unsourced label under another name.
      if (header.closedVocabulary.length === 0) {
        findings.push(`${decl.name}: not-a-label-table record declares no closed vocabulary`);
      }
      const allowed = new Set(header.closedVocabulary);
      for (const entry of entries) {
        for (const value of entry.values) {
          if (!allowed.has(value)) {
            findings.push(
              `${decl.name}: value "${value}" for "${entry.key}" is outside the declared closed vocabulary`,
            );
          }
        }
      }
    }
  }

  for (const d of deferred) {
    if (!declarations.some((decl) => decl.name === d.name)) {
      findings.push(
        `deferral for ${d.name} matches no declaration: remove it or fix the enumerator`,
      );
    }
  }
  return findings;
}

function parseDocRows(markdown: string): DocRow[] {
  const rows: DocRow[] = [];
  for (const line of markdown.split("\n")) {
    const m = /^\s*\|\s*(\d{3}-[A-Z0-9]{2})\b[^|]*\|\s*(yes|no)\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (m === null) continue;
    rows.push({
      field: m[1] ?? "",
      ships: m[2] === "yes",
      exportName: (m[3] ?? "").replace(/`/g, "").trim(),
    });
  }
  return rows;
}

/** Rule 2: the document and the exported surface agree, in both directions. */
function agreementFindings(
  rows: readonly DocRow[],
  declarations: readonly MapDeclaration[],
  withdrawnFields: readonly string[],
  exported: Readonly<Record<string, unknown>>,
): string[] {
  const findings: string[] = [];
  const labelTables = new Map<string, MapDeclaration>();
  for (const decl of declarations) {
    const header = parseHeader(decl.record);
    if (header?.kind === "label-table") labelTables.set(header.field, decl);
  }

  if (rows.length === 0) {
    findings.push("KNOWN-LIMITATIONS.md carries no machine-readable vocabulary table");
  }

  for (const row of rows) {
    const table = labelTables.get(row.field);
    if (row.ships) {
      if (table === undefined) {
        findings.push(
          `${row.field}: the document claims a label table ships; source declares none`,
        );
        continue;
      }
      if (table.name !== row.exportName) {
        findings.push(
          `${row.field}: the document names export ${row.exportName}; source declares ${table.name}`,
        );
      }
      const live = exported[row.exportName];
      if (!(live instanceof Map) || live.size === 0) {
        findings.push(
          `${row.field}: the document claims a table that is not exported, or is empty`,
        );
      }
    } else {
      if (table !== undefined) {
        findings.push(
          `${row.field}: the document denies a label table; source ships ${table.name}`,
        );
      }
      if (row.exportName.toLowerCase() !== "none") {
        findings.push(
          `${row.field}: the document denies a table yet names export ${row.exportName}`,
        );
      }
      if (!withdrawnFields.includes(row.field)) {
        findings.push(
          `${row.field}: the document denies a table with no vocab-withdrawn record in source saying why`,
        );
      }
    }
  }

  const documented = new Set(rows.map((r) => r.field));
  for (const [field, decl] of labelTables) {
    if (!documented.has(field)) {
      findings.push(`${field}: ${decl.name} ships a label table the document does not mention`);
    }
  }
  for (const field of withdrawnFields) {
    if (!documented.has(field)) {
      findings.push(`${field}: withdrawn in source, and the document does not say so`);
    }
  }
  return findings;
}

const SOURCE_FILES = listTypeScriptFiles(SRC_DIR).map((file) => ({
  file: file.slice(REPO_ROOT.length),
  text: readFileSync(file, "utf8"),
}));
const DECLARATIONS = SOURCE_FILES.flatMap((f) => extractMapDeclarations(f.file, f.text));
const WITHDRAWN = SOURCE_FILES.flatMap((f) => parseWithdrawnFields(f.text));
const KNOWN_LIMITATIONS = readFileSync(join(REPO_ROOT, "KNOWN-LIMITATIONS.md"), "utf8");
const DOC_ROWS = parseDocRows(KNOWN_LIMITATIONS);

describe("the guard can still see its subject", () => {
  it("enumerates the code-keyed tables that actually ship", () => {
    const names = DECLARATIONS.map((d) => d.name).sort();
    expect(names).toEqual([
      "DUR_REASON_MEANINGS",
      "FIELD_NAMES",
      "RESPONSE_STATUS_MEANINGS",
      "SEGMENT_ABSENCES",
      "SEGMENT_NAMES",
    ]);
  });

  it("reads the entries out of a declaration it enumerated", () => {
    const dur = DECLARATIONS.find((d) => d.name === "DUR_REASON_MEANINGS");
    const entries = parseEntries(dur?.body ?? "");
    expect(entries.map((e) => e.key)).toEqual(["TD", "ER", "DD", "PG", "PA", "LD", "HD"]);
    expect(entries[0]?.values).toEqual(["Therapeutic Duplication"]);
  });

  it("reads the machine-readable rows out of the document", () => {
    expect(DOC_ROWS.map((r) => r.field)).toEqual(["439-E4", "511-FB", "112-AN", "436-E1"]);
    expect(DOC_ROWS.filter((r) => r.ships).map((r) => r.exportName)).toEqual([
      "DUR_REASON_MEANINGS",
    ]);
  });
});

describe("a shipped label carries the artifact that establishes it", () => {
  it("finds no unsourced or over-long mapping in src/", () => {
    expect(declarationFindings(DECLARATIONS, DEFERRED)).toEqual([]);
  });

  it("names the artifact, the retrieval date, the sha256, the method and the control", () => {
    const dur = DECLARATIONS.find((d) => d.name === "DUR_REASON_MEANINGS");
    expect(dur).toBeDefined();
    expect(parseHeader(dur?.record ?? "")).toMatchObject({
      kind: "label-table",
      field: "439-E4",
      singleSource: true,
    });
    expect(dur?.record).toMatch(/retrieved:\s*2026-08-25/);
    expect(dur?.record).toMatch(/sha256:\s*[0-9a-f]{64}/);
    expect(dur?.record).toContain("artifact:");
    expect(dur?.record).toContain("method:");
    expect(dur?.record).toContain("negative-control:");
    expect(dur?.record).toContain("caveat:");
  });

  // SEEDED: an unsourced mapping the checker must catch on every run. Without this the
  // suite cannot tell "nothing is unsourced" from "the parser stopped matching".
  it("catches a seeded mapping that ships with no provenance record", () => {
    const seeded = extractMapDeclarations(
      "src/seeded.ts",
      [
        "const unrelated = 1;",
        'export const SEEDED_MEANINGS: ReadonlyMap<string, string> = new Map([["ZZ", "Seeded Label"]]);',
      ].join("\n"),
    );
    expect(seeded).toHaveLength(1);
    expect(declarationFindings(seeded, [])).toEqual([
      "SEEDED_MEANINGS (src/seeded.ts): a code-keyed map ships with no vocab-provenance record beside it",
    ]);
  });

  // SEEDED: a record that cites an artifact but does not pin or date it.
  it("catches a seeded provenance record with no sha256 and no retrieval date", () => {
    const seeded = extractMapDeclarations(
      "src/seeded.ts",
      [
        "// vocab-provenance: label-table field=999-ZZ single-source=true",
        "// artifact: something plausible",
        "// method: read it",
        "// negative-control: ran it",
        "// caveat: single-source",
        'export const SEEDED_MEANINGS: ReadonlyMap<string, string> = new Map([["ZZ", "Seeded Label"]]);',
      ].join("\n"),
    );
    const findings = declarationFindings(seeded, []);
    expect(findings).toContain("SEEDED_MEANINGS: provenance record carries no ISO retrieval date");
    expect(findings).toContain(
      "SEEDED_MEANINGS: provenance record does not pin the artifact by sha256",
    );
  });

  // SEEDED: the escape hatch cannot be used to ship a label under another name.
  it("catches a seeded not-a-label-table smuggling a label past its closed vocabulary", () => {
    const seeded = extractMapDeclarations(
      "src/seeded.ts",
      [
        "// vocab-provenance: not-a-label-table field=999-ZZ closed-vocabulary=paid|rejected",
        "export const SEEDED_STATUS: ReadonlyMap<string, StatusMeaning> = new Map([",
        '  ["P", { disposition: "paid", description: "Paid" }],',
        "]);",
      ].join("\n"),
    );
    expect(declarationFindings(seeded, [])).toEqual([
      'SEEDED_STATUS: value "Paid" for "P" is outside the declared closed vocabulary',
    ]);
  });

  // SEEDED: a deferral that has stopped matching anything must not sit there silently.
  it("catches a deferral entry that matches no declaration", () => {
    expect(declarationFindings([], [{ name: "GONE_NAMES", reason: "stale" }])).toEqual([
      "deferral for GONE_NAMES matches no declaration: remove it or fix the enumerator",
    ]);
  });
});

describe("a shipped label stays a short paraphrase, not transcribed prose", () => {
  it("every label that ships is a short phrase", () => {
    for (const decl of DECLARATIONS) {
      if (parseHeader(decl.record)?.kind !== "label-table") continue;
      for (const entry of parseEntries(decl.body)) {
        expect(labelFindings(decl.name, entry.values[0] ?? "")).toEqual([]);
      }
    }
  });

  // SEEDED: the repo's rule against redistributing NCPDP prose, made observable.
  it("catches a seeded sentence-length label", () => {
    const sentence =
      "An Original Prescription that duplicates a therapy the recipient is already taking.";
    const findings = labelFindings("SEEDED_MEANINGS", sentence);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.join(" ")).toContain("transcribed sentence");
  });

  it("does not flag a label that is genuinely short", () => {
    expect(labelFindings("SEEDED_MEANINGS", "Therapeutic Duplication")).toEqual([]);
  });
});

describe("the document and the exported surface agree about what exists", () => {
  it("finds no drift between KNOWN-LIMITATIONS.md and the package exports", () => {
    expect(
      agreementFindings(
        DOC_ROWS,
        DECLARATIONS,
        WITHDRAWN,
        telecom as unknown as Record<string, unknown>,
      ),
    ).toEqual([]);
  });

  it("the withdrawn fields all carry a record in source saying why", () => {
    expect([...new Set(WITHDRAWN)].sort()).toEqual(["112-AN", "436-E1", "511-FB"]);
  });

  it("the exports the document denies are genuinely gone, not shipped empty", () => {
    expect(telecom).not.toHaveProperty("REJECT_CODE_MEANINGS");
    expect(telecom).not.toHaveProperty("PRODUCT_QUALIFIER_MEANINGS");
    expect(telecom.DUR_REASON_MEANINGS.size).toBe(7);
  });

  // SEEDED: the document claims a table the package does not ship.
  it("catches a seeded document row claiming a table that does not exist", () => {
    const rows = parseDocRows("| 511-FB Reject Code | yes | `REJECT_CODE_MEANINGS` | somewhere |");
    expect(agreementFindings(rows, DECLARATIONS, WITHDRAWN, {})).toContain(
      "511-FB: the document claims a label table ships; source declares none",
    );
  });

  // SEEDED: the document denies a table the package does ship.
  it("catches a seeded document row denying a table that does exist", () => {
    const rows = parseDocRows("| 439-E4 Reason For Service | no | none | none obtainable |");
    const findings = agreementFindings(rows, DECLARATIONS, WITHDRAWN, {});
    expect(findings).toContain(
      "439-E4: the document denies a label table; source ships DUR_REASON_MEANINGS",
    );
  });

  // SEEDED: a claimed table that is exported but empty is drift too.
  it("catches a seeded claimed table that is exported empty", () => {
    const rows = parseDocRows(
      "| 439-E4 Reason For Service | yes | `DUR_REASON_MEANINGS` | cited |",
    );
    expect(
      agreementFindings(rows, DECLARATIONS, WITHDRAWN, {
        DUR_REASON_MEANINGS: new Map<string, string>(),
      }),
    ).toContain("439-E4: the document claims a table that is not exported, or is empty");
  });

  // SEEDED: a withdrawal the document never mentions.
  it("catches a field withdrawn in source that the document does not mention", () => {
    expect(agreementFindings([], [], ["999-ZZ"], {})).toContain(
      "999-ZZ: withdrawn in source, and the document does not say so",
    );
  });
});
