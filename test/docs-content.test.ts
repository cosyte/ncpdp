import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { docSnippetSuite } from "@cosyte/vitest-config/snippets";

import * as packageRoot from "../src/index.js";

/**
 * Doc/code-agreement gate. Every ```` ```ts runnable ```` block in `docs-content/` is extracted,
 * compiled, and executed, and its inline `// =>` assertions are checked, so a documented example
 * can never silently drift from the shipped code (the documentation analog of the parser conformance
 * runners). Blocks tagged ` ```ts runnable throws ` must throw; plain ` ```ts ` blocks are
 * illustrative and are not executed.
 *
 * NCPDP ships two structurally unrelated standards under four subpaths, so a snippet imports the
 * exact subpath a consumer would (`@cosyte/ncpdp`, `/script`, `/telecom`, `/common`, `/profiles`).
 * The runnable blocks stay on the deterministic, in-process readers/serializers: `parseScript`,
 * `parseTelecom`, `claim`, and friends; nothing here opens a socket or reads a real feed.
 *
 * Snippets resolve against the **built** artifacts, not the source tree, so they exercise exactly
 * what an installer loads (self-contained bundles, no internal `.js`→`.ts` resolution). The shared CI
 * gate runs `test` before `build`, so we provision `dist/` on demand here rather than assuming order.
 */
const root = join(import.meta.dirname, "..");

/** Map each published subpath to its built ESM entry. */
const SUBPATHS: Record<string, string> = {
  "@cosyte/ncpdp": join(root, "dist", "index.mjs"),
  "@cosyte/ncpdp/script": join(root, "dist", "script", "index.mjs"),
  "@cosyte/ncpdp/telecom": join(root, "dist", "telecom", "index.mjs"),
  "@cosyte/ncpdp/common": join(root, "dist", "common", "index.mjs"),
  "@cosyte/ncpdp/profiles": join(root, "dist", "profiles", "index.mjs"),
};

beforeAll(() => {
  execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
}, 120_000);

docSnippetSuite({
  docsDir: join(root, "docs-content"),
  resolve: (specifier) => SUBPATHS[specifier],
});

/**
 * THE STRUCTURAL GATE OVER THE SAME BUNDLE.
 *
 * `docs-content/` is what `scripts/build-docs-artifacts.sh` tars into `docs-content.tar.gz` for
 * the documentation site, so it is a PUBLISHED surface and what it omits, a consumer does not
 * learn. The suite above proves every runnable example still agrees with the code. It says nothing
 * about the bundle's SHAPE, and the shape is where this surface rotted: two frontmatter
 * conventions, two spellings for the same link target, a closing section on three pages of twelve,
 * three pages reachable from the sidebar and from no other page, and seven diagnostic codes the
 * package exports that were named on no page at all.
 *
 * A one-time sweep regresses the first time someone writes a page. This repo's own words for that,
 * in `scripts/check-no-internal-refs.sh`: "a documented rule governs whoever reads it; a gate
 * governs everyone". Six rules:
 *
 *  1. ONE FRONTMATTER SHAPE. Every page declares an `id` equal to its own filename stem, a
 *     `title`, a short `sidebar_label` and a one-sentence `description`, and declares NO ordering
 *     position key. `sidebars.json` is the single ordering authority, and it is explicit, so a
 *     `sidebar_position` orders nothing: four pages claiming position `1` was contradictory
 *     metadata a reader could not tell from a bug.
 *  2. THE SIDEBAR AND THE BUNDLE ARE A BIJECTION. Every page appears exactly once in the manifest
 *     and every manifest entry resolves to a page. `build-docs-artifacts.sh` checks only that
 *     `intro.md` and `sidebars.json` exist, so before this rule an unlisted page tarred and
 *     shipped unreachable.
 *  3. ONE LINK SPELLING, AND EVERY LINK RESOLVES. The convention is DERIVED from the bundle
 *     (the spelling the majority of resolving cross-page links use) rather than declared, so the
 *     rule reports what "the convention the other links use" actually is. A link that departs
 *     from it is named with its source page, and so is a relative target that resolves to no page.
 *  4. EVERY PAGE IS REACHED FROM ANOTHER PAGE. The entry page is exempt and is itself derived
 *     from the manifest rather than named here. Everything else must be linked from at least one
 *     other page, so no page is reachable from the sidebar alone.
 *  5. EVERY PAGE OFFERS AN ONWARD LINK AT ITS END. The page's last `##` section must carry at
 *     least one link to another page of the bundle, so a reader who reaches the bottom is never
 *     left there.
 *  6. THE DIAGNOSTIC CODE SET IS DERIVED, AND THE COVERAGE REDS IN BOTH DIRECTIONS. The codes come
 *     from the package's own exported registries at run time, discovered by shape (every
 *     `*_CODES` export of the package root whose values are all strings) rather than copied into a
 *     list here. A copied list satisfies nothing: it agrees with itself forever. A code the
 *     package exports and no page names fails, and so does a code a page names that the package
 *     does not export, which is what catches a retirement.
 *
 * EVERY RULE CARRIES A SEEDED COUNTEREXAMPLE, for the reason `conformance-statement.test.ts` gives
 * at length: a checker whose matcher has quietly stopped seeing its subject passes forever, and a
 * green run over a subject it cannot see is worth nothing.
 *
 * WHAT THIS DELIBERATELY CANNOT SEE, said rather than claimed away:
 *
 *  - **The reverse coverage direction is keyed on the code PREFIXES the package ships**
 *    (`NCPDP_SCRIPT`, `NCPDP_TELECOM`, derived from the registries, not written here). A code
 *    with no such prefix is invisible to it: `EMPTY_INPUT` is shared between the two standards and
 *    is the one shipped code in that position, so were it retired while a page still named it,
 *    this rule would not say so. Widening the scan to every SCREAMING_SNAKE token was measured and
 *    refused: the pages legitimately name exported constants (`SCRIPT_WARNING_MESSAGES`,
 *    `KNOWN_SCRIPT_VERSIONS`, `SEGMENT_CODE_RANGES`) that are not diagnostic codes at all.
 *  - **"Named on a page" is a token match, not a claim that the page explains the code.** A page
 *    that lists a code and says nothing useful about it passes. The rule closes the surface; it
 *    does not grade the prose.
 *  - **The onward-link rule keys on the LAST `##` SECTION**, so a page could satisfy it with a
 *    link buried in a closing section about something else. It bounds "a reader reaching the end
 *    has somewhere to go", not the quality of the destination.
 *  - **Only `.md` pages are the bundle.** `sidebars.json` is the manifest, not a page, and a
 *    non-markdown asset added under `docs-content/` is outside every rule here.
 */

/** Where the bundle lives. The same directory the snippet suite above reads. */
const DOCS_DIR = join(root, "docs-content");

/** The sidebar manifest, which is the single ordering authority for the bundle. */
const SIDEBAR_FILE = "sidebars.json";

/** The frontmatter keys every page of the bundle must declare. */
const REQUIRED_FRONTMATTER = ["id", "title", "sidebar_label", "description"] as const;

/**
 * A sidebar label is a tree entry, not a heading: it has to fit beside its siblings. The bound is
 * this repo's own longest existing label plus room, not a style rule imported from anywhere.
 */
const SIDEBAR_LABEL_MAX = 40;

/** A page description is one sentence for a search result, not a paragraph. */
const DESCRIPTION_MAX = 200;

/** A sentence break inside a description: a terminator followed by more prose. */
const SENTENCE_BREAK = /[.!?]\s+\S/;

/** An ordering key. Keyed on the word rather than the exact spelling, so a rename is caught too. */
const ORDERING_KEY = /position/i;

/** One page of the bundle. */
interface Page {
  /** The filename stem, which is what a link target and a sidebar entry name. */
  readonly stem: string;
  /** The file name, used in every finding so a failure names the file. */
  readonly file: string;
  /** The parsed frontmatter block, keys in declaration order. */
  readonly frontmatter: ReadonlyMap<string, string>;
  /** Everything after the frontmatter block. */
  readonly body: string;
}

/** A cross-page link, as read off the page that carries it. */
interface Link {
  /** The page the link was read from. */
  readonly from: string;
  /** The target exactly as written, anchor included. */
  readonly target: string;
  /** The filename stem the target names. */
  readonly stem: string;
  /** Whether the target carries the `.md` extension. */
  readonly spelling: "extensionless" | "with-extension";
}

/**
 * Parse a page's frontmatter block into an ordered map. Deliberately a line reader rather than a
 * YAML parser: the block is flat `key: value` pairs by construction, and rule 1 is about which
 * keys are declared, so a parser that silently accepted a nested block would hide the thing being
 * checked.
 */
function parseFrontmatter(text: string): { frontmatter: Map<string, string>; body: string } {
  const frontmatter = new Map<string, string>();
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return { frontmatter, body: text };
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return { frontmatter, body: text };
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (match === null) continue;
    const key = match[1] ?? "";
    const raw = (match[2] ?? "").trim();
    const unquoted = /^"(.*)"$/.exec(raw) ?? /^'(.*)'$/.exec(raw);
    frontmatter.set(key, unquoted?.[1] ?? raw);
  }
  return { frontmatter, body: lines.slice(end + 1).join("\n") };
}

/** Read every markdown page of the bundle off disk. */
function readPages(): Page[] {
  const pages: Page[] = [];
  for (const file of readdirSync(DOCS_DIR).sort()) {
    if (!file.endsWith(".md")) continue;
    const text = readFileSync(join(DOCS_DIR, file), "utf8");
    const { frontmatter, body } = parseFrontmatter(text);
    pages.push({ stem: basename(file, ".md"), file, frontmatter, body });
  }
  return pages;
}

/**
 * Every doc id in a Docusaurus sidebar definition, in tree order.
 *
 * A doc id is a bare string AT AN ARRAY POSITION. An object's scalar properties are not doc ids,
 * and the distinction is load-bearing rather than pedantic: a category carries `"type": "category"`
 * and `"label": "Installation"`, and a walker that collects every string in the tree reads both as
 * pages. `conformance-statement.test.ts` has the permissive shape and never notices, because it
 * only ever asks whether one id is present; a BIJECTION rule asks the opposite question too, so it
 * sees every one of those strings as a dangling entry. Recurse into containers, take strings only
 * where a page can appear.
 */
function sidebarDocIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v: unknown) => (typeof v === "string" ? [v] : sidebarDocIds(v)));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value as Record<string, unknown>).flatMap((v) =>
      typeof v === "string" ? [] : sidebarDocIds(v),
    );
  }
  return [];
}

/**
 * Every relative cross-page link on a page. Absolute URLs (the bundle links out to
 * `KNOWN-LIMITATIONS.md` on GitHub that way, deliberately) and anchor-only links are not
 * cross-page links and are not this rule's business.
 */
function pageLinks(page: Page): Link[] {
  const links: Link[] = [];
  for (const match of page.body.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1] ?? "";
    if (target.startsWith("#")) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const path = target.split("#")[0] ?? "";
    if (path === "") continue;
    const withExtension = path.endsWith(".md");
    links.push({
      from: page.file,
      target,
      stem: basename(path, ".md"),
      spelling: withExtension ? "with-extension" : "extensionless",
    });
  }
  return links;
}

/**
 * The link spelling the bundle actually uses, derived rather than declared: the spelling the
 * majority of resolving cross-page links carry. A tie resolves to the extensionless form, which is
 * the spelling a Docusaurus doc id is written in and the one `sidebars.json` and the `id`
 * frontmatter key already use.
 */
function derivedSpelling(links: readonly Link[], stems: ReadonlySet<string>): Link["spelling"] {
  const resolving = links.filter((l) => stems.has(l.stem));
  const bare = resolving.filter((l) => l.spelling === "extensionless").length;
  return bare >= resolving.length - bare ? "extensionless" : "with-extension";
}

/** Rules 1: one frontmatter shape across the bundle, and no ordering key anywhere in it. */
function frontmatterFindings(pages: readonly Page[]): string[] {
  const findings: string[] = [];
  for (const page of pages) {
    for (const key of REQUIRED_FRONTMATTER) {
      if (!page.frontmatter.has(key)) findings.push(`${page.file}: declares no "${key}"`);
    }
    const id = page.frontmatter.get("id");
    if (id !== undefined && id !== page.stem) {
      findings.push(`${page.file}: declares id "${id}", which is not its filename stem`);
    }
    for (const key of page.frontmatter.keys()) {
      if (ORDERING_KEY.test(key)) {
        findings.push(
          `${page.file}: declares the ordering key "${key}", and sidebars.json is the ordering authority`,
        );
      }
    }
    const label = page.frontmatter.get("sidebar_label");
    if (label !== undefined && label.length > SIDEBAR_LABEL_MAX) {
      findings.push(
        `${page.file}: sidebar_label is ${String(label.length)} characters, over ${String(SIDEBAR_LABEL_MAX)}`,
      );
    }
    const description = page.frontmatter.get("description");
    if (description !== undefined) {
      if (description === "") findings.push(`${page.file}: declares an empty "description"`);
      else if (description.length > DESCRIPTION_MAX) {
        findings.push(
          `${page.file}: description is ${String(description.length)} characters, over ${String(DESCRIPTION_MAX)}`,
        );
      } else if (SENTENCE_BREAK.test(description)) {
        findings.push(`${page.file}: description carries more than one sentence`);
      }
    }
  }
  return findings;
}

/** Rule 2: the bundle and the sidebar manifest are a bijection. */
function sidebarFindings(pages: readonly Page[], docIds: readonly string[]): string[] {
  const findings: string[] = [];
  const stems = new Set(pages.map((p) => p.stem));
  for (const page of pages) {
    const count = docIds.filter((id) => id === page.stem).length;
    if (count === 0) {
      findings.push(
        `${page.file}: is in the bundle and in no ${SIDEBAR_FILE} entry, so it tars into the release artifact unreachable`,
      );
    } else if (count > 1) {
      findings.push(`${page.file}: appears ${String(count)} times in ${SIDEBAR_FILE}, not once`);
    }
  }
  for (const id of new Set(docIds)) {
    if (!stems.has(id)) {
      findings.push(`${SIDEBAR_FILE}: entry "${id}" resolves to no page of the bundle`);
    }
  }
  return findings;
}

/** Rule 3: one spelling for every cross-page link, and every one of them resolves. */
function linkFindings(pages: readonly Page[]): string[] {
  const findings: string[] = [];
  const stems = new Set(pages.map((p) => p.stem));
  const links = pages.flatMap((p) => pageLinks(p));
  const convention = derivedSpelling(links, stems);
  for (const link of links) {
    if (!stems.has(link.stem)) {
      findings.push(
        `${link.from}: relative link "${link.target}" resolves to no page of the bundle`,
      );
      continue;
    }
    if (link.spelling !== convention) {
      findings.push(
        `${link.from}: relative link "${link.target}" is spelled ${link.spelling} where the bundle's convention is ${convention}`,
      );
    }
  }
  return findings;
}

/** Rule 4: no page is reachable from the sidebar alone. */
function inboundFindings(pages: readonly Page[], entry: string): string[] {
  const findings: string[] = [];
  const stems = new Set(pages.map((p) => p.stem));
  for (const page of pages) {
    if (page.stem === entry) continue;
    const inbound = pages.filter(
      (other) =>
        other.stem !== page.stem && pageLinks(other).some((link) => link.stem === page.stem),
    );
    if (inbound.length === 0) {
      findings.push(
        `${page.file}: no other page of the bundle links to it, so it is reachable from the sidebar alone`,
      );
    }
  }
  if (!stems.has(entry)) findings.push(`the entry page "${entry}" is not a page of the bundle`);
  return findings;
}

/** Rule 5: the end of every page offers somewhere to go next. */
function onwardFindings(pages: readonly Page[]): string[] {
  const findings: string[] = [];
  const stems = new Set(pages.map((p) => p.stem));
  for (const page of pages) {
    const headings = [...page.body.matchAll(/^## .*$/gm)];
    const last = headings.at(-1);
    const tail = last?.index === undefined ? page.body : page.body.slice(last.index);
    const onward = pageLinks({ ...page, body: tail }).filter(
      (link) => stems.has(link.stem) && link.stem !== page.stem,
    );
    if (onward.length === 0) {
      findings.push(
        `${page.file}: its last section offers no onward link to another page of the bundle`,
      );
    }
  }
  return findings;
}

/**
 * The diagnostic codes the package exports, discovered by SHAPE rather than by name: every
 * `*_CODES` export of the package root whose values are all strings. A registry added to the
 * package arrives here without anyone editing this file, which is the whole point; a list copied
 * into this file would agree with itself forever.
 */
function exportedCodes(namespace: Record<string, unknown>): {
  registries: string[];
  codes: Set<string>;
} {
  const registries: string[] = [];
  const codes = new Set<string>();
  for (const [name, value] of Object.entries(namespace)) {
    if (!name.endsWith("_CODES")) continue;
    if (typeof value !== "object" || value === null) continue;
    const entries = Object.values(value as Record<string, unknown>);
    if (entries.length === 0 || !entries.every((v) => typeof v === "string")) continue;
    registries.push(name);
    for (const code of entries) codes.add(code);
  }
  return { registries: registries.sort(), codes };
}

/**
 * The token shapes the reverse direction can see, derived from the shipped codes themselves. A
 * code of three or more underscore-separated segments contributes its first two as a prefix, which
 * on this package yields `NCPDP_SCRIPT` and `NCPDP_TELECOM`. A shorter code contributes nothing:
 * see the residual stated at the top of this block.
 */
function codePrefixes(codes: ReadonlySet<string>): string[] {
  const prefixes = new Set<string>();
  for (const code of codes) {
    const segments = code.split("_");
    if (segments.length >= 3) prefixes.add(segments.slice(0, 2).join("_"));
  }
  return [...prefixes].sort();
}

/** Rule 6: the bundle names every shipped diagnostic code, and names no code that is not shipped. */
function codeFindings(pages: readonly Page[], codes: ReadonlySet<string>): string[] {
  const findings: string[] = [];
  for (const code of [...codes].sort()) {
    const named = pages.some((p) => new RegExp(`\\b${code}\\b`).test(p.body));
    if (!named) {
      findings.push(
        `${code}: the package exports it and no page of the bundle names it, so a consumer cannot look it up`,
      );
    }
  }
  const prefixes = codePrefixes(codes);
  if (prefixes.length === 0) return findings;
  const shaped = new RegExp(`\\b(?:${prefixes.join("|")})_[A-Z0-9_]+\\b`, "g");
  for (const page of pages) {
    for (const token of new Set(page.body.match(shaped) ?? [])) {
      if (codes.has(token)) continue;
      findings.push(
        `${page.file}: names ${token}, which the package does not export, so the page outlived the code`,
      );
    }
  }
  return findings;
}

const PAGES = readPages();
const SIDEBAR = JSON.parse(readFileSync(join(DOCS_DIR, SIDEBAR_FILE), "utf8")) as unknown;
const DOC_IDS = sidebarDocIds(SIDEBAR);
/** The entry page, derived from the manifest rather than named: the first doc id in tree order. */
const ENTRY = DOC_IDS[0] ?? "";
const { registries: REGISTRIES, codes: CODES } = exportedCodes(packageRoot);

/** A page built for a seeded counterexample, so a rule is proved against a violator it can see. */
function seededPage(stem: string, frontmatter: Record<string, string>, body: string): Page {
  return {
    stem,
    file: `${stem}.md`,
    frontmatter: new Map(Object.entries(frontmatter)),
    body,
  };
}

/** The frontmatter a well-formed page of this bundle carries, for seeding around. */
const WELL_FORMED: Record<string, string> = {
  id: "seeded",
  title: "Seeded",
  sidebar_label: "Seeded",
  description: "A page built for a counterexample.",
};

describe("the docs gate can still see its subject", () => {
  it("reads every markdown page of the bundle off disk", () => {
    expect(PAGES.length).toBeGreaterThan(1);
    expect(PAGES.map((p) => p.stem)).toContain(ENTRY);
    expect(PAGES.every((p) => p.frontmatter.size > 0)).toBe(true);
  });

  it("derives the diagnostic code set from the package's exported registries", () => {
    expect(REGISTRIES).toEqual([
      "SCRIPT_BUILD_CODES",
      "SCRIPT_FATAL_CODES",
      "SCRIPT_WARNING_CODES",
      "TELECOM_BUILD_CODES",
      "TELECOM_FATAL_CODES",
      "TELECOM_WARNING_CODES",
    ]);
    expect(CODES.size).toBeGreaterThan(0);
    for (const registry of REGISTRIES) {
      const values = Object.values(
        (packageRoot as unknown as Record<string, Record<string, string>>)[registry] ?? {},
      );
      expect(values.length).toBeGreaterThan(0);
      for (const code of values) expect(CODES.has(code)).toBe(true);
    }
  });

  it("derives the reverse-scan prefixes from the shipped codes rather than a list", () => {
    expect(codePrefixes(CODES)).toEqual(["NCPDP_SCRIPT", "NCPDP_TELECOM"]);
  });

  it("derives the entry page and the link spelling from the bundle", () => {
    expect(ENTRY).toBe("intro");
    expect(
      derivedSpelling(
        PAGES.flatMap((p) => pageLinks(p)),
        new Set(PAGES.map((p) => p.stem)),
      ),
    ).toBe("extensionless");
  });

  it("reads doc ids out of the sidebar without reading its category labels as pages", () => {
    expect([...DOC_IDS].sort()).toEqual(PAGES.map((p) => p.stem).sort());
    expect(
      sidebarDocIds({
        docs: ["intro", { type: "category", label: "Guides", items: ["cookbook"] }],
      }),
    ).toEqual(["intro", "cookbook"]);
  });

  it("reads a frontmatter block without reading past it", () => {
    const parsed = parseFrontmatter(
      '---\nid: x\ntitle: "A: B"\n---\n\n# Heading\n\nid: not-here\n',
    );
    expect([...parsed.frontmatter]).toEqual([
      ["id", "x"],
      ["title", "A: B"],
    ]);
    expect(parsed.body).toContain("# Heading");
  });

  it("reads cross-page links and ignores the ones that are not cross-page", () => {
    const page = seededPage(
      "seeded",
      WELL_FORMED,
      "[a](./intro) [b](./intro.md) [c](#anchor) [d](https://example.com/x)",
    );
    expect(pageLinks(page).map((l) => `${l.stem}:${l.spelling}`)).toEqual([
      "intro:extensionless",
      "intro:with-extension",
    ]);
  });
});

describe("every page of the bundle declares one frontmatter shape", () => {
  it("declares an id equal to its stem, a title, a label and a description, and no ordering key", () => {
    expect(frontmatterFindings(PAGES)).toEqual([]);
  });

  // SEEDED: each required key removed on its own.
  it("catches a page missing any required key, naming the file and the key", () => {
    for (const key of REQUIRED_FRONTMATTER) {
      const without = { ...WELL_FORMED };
      delete without[key];
      expect(frontmatterFindings([seededPage("seeded", without, "")])).toContain(
        `seeded.md: declares no "${key}"`,
      );
    }
  });

  // SEEDED: an id that is not the filename stem, which breaks every link to the page.
  it("catches an id that is not the filename stem", () => {
    expect(
      frontmatterFindings([seededPage("seeded", { ...WELL_FORMED, id: "elsewhere" }, "")]),
    ).toContain('seeded.md: declares id "elsewhere", which is not its filename stem');
  });

  // SEEDED: the ordering key coming back. Four pages claiming position `1` is the state the
  // bundle shipped in, and with an explicit sidebars.json the key orders nothing at all.
  it("catches a reintroduced ordering position key, under any spelling", () => {
    expect(
      frontmatterFindings([seededPage("seeded", { ...WELL_FORMED, sidebar_position: "1" }, "")]),
    ).toContain(
      'seeded.md: declares the ordering key "sidebar_position", and sidebars.json is the ordering authority',
    );
    expect(
      frontmatterFindings([seededPage("seeded", { ...WELL_FORMED, position: "1" }, "")]).join(" "),
    ).toContain('declares the ordering key "position"');
  });

  // SEEDED: a label too long for a tree entry, and a description that is a paragraph.
  it("catches a long sidebar label and a multi-sentence description", () => {
    expect(
      frontmatterFindings([
        seededPage("seeded", { ...WELL_FORMED, sidebar_label: "x".repeat(41) }, ""),
      ]).join(" "),
    ).toContain("sidebar_label is 41 characters");
    expect(
      frontmatterFindings([
        seededPage("seeded", { ...WELL_FORMED, description: "One thing. And another." }, ""),
      ]),
    ).toContain("seeded.md: description carries more than one sentence");
  });
});

describe("the bundle and the sidebar manifest are a bijection", () => {
  it("lists every page exactly once, and every entry resolves", () => {
    expect(sidebarFindings(PAGES, DOC_IDS)).toEqual([]);
  });

  // SEEDED: the failure that ships a page nobody can reach. Nothing in
  // build-docs-artifacts.sh would have noticed: it checks that intro.md and sidebars.json exist.
  it("catches a page with no sidebar entry, naming the orphan", () => {
    expect(
      sidebarFindings(
        PAGES,
        DOC_IDS.filter((id) => id !== "cookbook"),
      ).join(" "),
    ).toContain("cookbook.md: is in the bundle and in no sidebars.json entry");
  });

  // SEEDED: a manifest entry pointing at a page that is not there.
  it("catches a dangling sidebar entry, naming the entry", () => {
    expect(sidebarFindings(PAGES, [...DOC_IDS, "never-written"])).toContain(
      'sidebars.json: entry "never-written" resolves to no page of the bundle',
    );
  });

  // SEEDED: the same page listed twice, which renders it twice in the tree.
  it("catches a page listed more than once", () => {
    expect(sidebarFindings(PAGES, [...DOC_IDS, "cookbook"])).toContain(
      "cookbook.md: appears 2 times in sidebars.json, not once",
    );
  });
});

describe("cross-page links use one spelling and all resolve", () => {
  it("spells every cross-page link the same way, and resolves every one", () => {
    expect(linkFindings(PAGES)).toEqual([]);
  });

  // SEEDED: the second spelling, which is the state the bundle shipped in: `./conformance` and
  // `./conformance.md` both named the same page, on different pages.
  it("catches a target spelled against the convention, naming the page and the target", () => {
    const seeded = [...PAGES, seededPage("seeded", WELL_FORMED, "See [it](./conformance.md).")];
    expect(linkFindings(seeded)).toContain(
      'seeded.md: relative link "./conformance.md" is spelled with-extension where the bundle\'s convention is extensionless',
    );
  });

  // SEEDED: a relative link to a page that is not in the bundle.
  it("catches a relative link that resolves to nothing, naming the page and the target", () => {
    const seeded = [...PAGES, seededPage("seeded", WELL_FORMED, "See [it](./not-a-page).")];
    expect(linkFindings(seeded)).toContain(
      'seeded.md: relative link "./not-a-page" resolves to no page of the bundle',
    );
  });

  // SEEDED: the convention is DERIVED, so a bundle that genuinely uses the other spelling
  // everywhere is consistent rather than wrong. This is what stops the rule being a style
  // preference dressed up as a gate.
  it("follows the bundle when the bundle uses the other spelling throughout", () => {
    const both = [
      seededPage("a", WELL_FORMED, "[to b](./b.md)"),
      seededPage("b", WELL_FORMED, "[to a](./a.md)"),
    ];
    expect(linkFindings(both)).toEqual([]);
  });
});

describe("no page of the bundle is reachable from the sidebar alone", () => {
  it("links every page from at least one other page", () => {
    expect(inboundFindings(PAGES, ENTRY)).toEqual([]);
  });

  // SEEDED: the three pages that shipped reachable only from the sidebar.
  it("catches a page nothing links to, naming it", () => {
    const seeded = [...PAGES, seededPage("unreached", WELL_FORMED, "[out](./intro)")];
    expect(inboundFindings(seeded, ENTRY)).toContain(
      "unreached.md: no other page of the bundle links to it, so it is reachable from the sidebar alone",
    );
  });

  // SEEDED: a page linking only to itself is not linked from another page.
  it("does not count a page's own link to itself as an inbound link", () => {
    const seeded = [seededPage("alone", WELL_FORMED, "[me](./alone)"), ...PAGES];
    expect(inboundFindings(seeded, ENTRY).join(" ")).toContain("alone.md: no other page");
  });
});

describe("the end of every page offers somewhere to go next", () => {
  it("closes every page with a link to another page of the bundle", () => {
    expect(onwardFindings(PAGES)).toEqual([]);
  });

  // SEEDED: the shape nine of the twelve pages shipped in, closing on a section with no way out.
  it("catches a page whose last section offers no onward link", () => {
    const seeded = seededPage(
      "seeded",
      WELL_FORMED,
      "[early](./intro)\n\n## The last word\n\nNothing further.\n",
    );
    expect(onwardFindings([seeded])).toContain(
      "seeded.md: its last section offers no onward link to another page of the bundle",
    );
  });

  // SEEDED: an onward link to the page itself is not an onward link.
  it("does not accept a self-link as the onward link", () => {
    const seeded = seededPage("seeded", WELL_FORMED, "## Next\n\n[itself](./seeded)\n");
    expect(onwardFindings([seeded]).join(" ")).toContain("offers no onward link");
  });
});

describe("the bundle names every diagnostic code the package exports", () => {
  it("names every shipped code on at least one page", () => {
    expect(codeFindings(PAGES, CODES)).toEqual([]);
  });

  // SEEDED: a code the package exports that no page names. This is the state seven codes shipped
  // in, and two of them carried the fail-safe precedence rule that a denial is never masked by a
  // co-present approval, which is exactly the class of fact this library exists to make visible.
  it("catches a shipped code the bundle never names, naming the code", () => {
    expect(codeFindings(PAGES, new Set([...CODES, "NCPDP_SCRIPT_NEVER_WRITTEN_DOWN"]))).toContain(
      "NCPDP_SCRIPT_NEVER_WRITTEN_DOWN: the package exports it and no page of the bundle names it, so a consumer cannot look it up",
    );
  });

  // SEEDED: the other direction. A code retired from the registries while a page still names it
  // leaves the reader looking up something that can no longer be raised.
  it("catches a page naming a code the package does not export, naming both", () => {
    const seeded = [
      ...PAGES,
      seededPage("seeded", WELL_FORMED, "Raises `NCPDP_TELECOM_RETIRED_LAST_RELEASE`."),
    ];
    expect(codeFindings(seeded, CODES)).toContain(
      "seeded.md: names NCPDP_TELECOM_RETIRED_LAST_RELEASE, which the package does not export, so the page outlived the code",
    );
  });

  // SEEDED: the forward rule keys on the WHOLE code. A page naming a prefix of one has not
  // named it, which is what stops a partial mention from satisfying the coverage rule.
  it("does not count a partial token as naming the code", () => {
    const partial = [seededPage("seeded", WELL_FORMED, "Raises NCPDP_TELECOM_UNKNOWN.")];
    expect(codeFindings(partial, new Set(["NCPDP_TELECOM_UNKNOWN_SEGMENT"])).join(" ")).toContain(
      "NCPDP_TELECOM_UNKNOWN_SEGMENT: the package exports it and no page of the bundle names it",
    );
  });
});
