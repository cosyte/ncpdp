#!/usr/bin/env tsx
/**
 * `@cosyte/ncpdp` PHI scanner — the CI / pre-commit half of the PHI commit-gate.
 *
 * Pure Node. Zero runtime deps (the scanner does NOT reuse the package's own
 * `fast-xml-parser` — a safety gate must be independent of the code it guards, so
 * a shared parser bug cannot blind both). Walks the synthetic NCPDP test fixtures
 * (and a conservative text pass over `src/`) and REFUSES anything that looks like
 * real PHI, so a developer cannot commit a real-looking NCPDP fixture by accident.
 *
 * NCPDP is TWO structurally unrelated wire formats under one brand, and this
 * scanner covers BOTH:
 *   - **SCRIPT** (ePrescribing) — XML. PHI lives in named elements: `<LastName>` /
 *     `<FirstName>` (patient AND prescriber), `<DateOfBirth><Date>`, `<Address>`
 *     lines, `<SocialSecurity>` / member-id elements, and free-text notes.
 *   - **Telecom Standard** (pharmacy claims) — control-char-delimited, field-id
 *     keyed (FS `0x1C` / GS `0x1D` / RS `0x1E`). PHI lives in 2-character field
 *     ids: Patient First/Last Name (`CA`/`CB`), Date of Birth (`C4`), Patient
 *     Street Address (`CM`), Patient Phone (`CQ`), Patient ID (`CY`), and the
 *     Insurance Cardholder ID (`C2`).
 *
 * Neither format can carry an inline `# synthetic: true` header (SCRIPT is XML;
 * Telecom is byte-framed) — the same constraint HL7, DICOM (binary `.dcm`), and
 * X12 (byte-strict `.edi`) hit — so we solve it the same proven way: a **synthetic
 * allow-list** (`scripts/phi-allow-list.txt`) is the positive declaration that a
 * fixture's identifiers are fake. Any realistic-PHI-shaped token not covered by
 * the allow-list is a hit. Adding a new synthetic fixture therefore means either
 * reusing known-synthetic tokens or consciously extending the allow-list — a
 * reviewed act, never silent.
 *
 * Detection is NCPDP-shape-aware, NOT a blind text regex: the SCRIPT scan is an
 * element-stack XML walk that inspects only the leaf tags that carry each PHI
 * category (so `<BusinessName>Synthetic Community Pharmacy</BusinessName>` and
 * `<DrugDescription>` never trip a name detector); the Telecom scan splits on the
 * NCPDP separators and keys off the self-identifying 2-char field ids (globally
 * unique in the standard), so a mislabeled Segment Identification cannot bypass a
 * per-field detector. See `phi-scan-overrides.md` for the category → location map
 * and the documented limitations.
 *
 * NCPDP redistribution note: this scanner encodes only wire-format field ids and
 * our own paraphrased category labels — no NCPDP-copyrighted spec prose.
 *
 * SECURITY: every subprocess is `git`, invoked via `execFileSync` with array
 * args only. Never shell-form spawn.
 *
 * Modes:
 *   --staged                 - scan only files staged in `git diff --cached`
 *   --allow-fixture <path>   - bypass one path; rejected unless logged in
 *                              phi-scan-overrides.md
 *   <path> [<path>...]       - scan specific paths
 *   (no args)                - scan all in-scope working-tree files
 *
 * Exit codes: 0 (clean), 1 (hits found), 2 (invocation error).
 */

import { readFileSync, statSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, sep, isAbsolute } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();
const ALLOW_LIST_PATH = join(REPO_ROOT, "scripts", "phi-allow-list.txt");
const OVERRIDE_LOG_PATH = join(REPO_ROOT, "phi-scan-overrides.md");

// Roots walked in "all" mode. test/fixtures gets the full NCPDP-aware scan; src
// gets a conservative text pass (dashed-SSN + non-test email only) because it is
// hand-written code, not data — JSDoc `@example` snippets carry synthetic
// names/ids that must not trip the structural detectors.
const FIXTURE_ROOT = join(REPO_ROOT, "test", "fixtures");
const SRC_ROOT = join(REPO_ROOT, "src");

// NCPDP Telecommunication Standard separators (control characters): Field
// Separator (FS, 0x1C), Group Separator (GS, 0x1D), Segment Separator (RS, 0x1E).
// Tokenization splits on the union of the three; see `scanTelecom`.

// Telecom 2-character field ids that carry patient / cardholder PHI, keyed to the
// PHI category the value must be checked against. These ids are globally unique in
// the NCPDP Telecommunication standard, so keying off the field id (rather than the
// enclosing segment) is both correct AND bypass-resistant: a corrupt or missing
// Segment Identification (`AM`) field cannot route a value away from its detector.
type TelecomCategory = "name" | "dob" | "address" | "phone" | "id" | "memberid";
const TELECOM_PHI_FIELDS: Readonly<Record<string, TelecomCategory>> = {
  // Patient segment (01)
  CA: "name", // 310-CA Patient First Name
  CB: "name", // 311-CB Patient Last Name
  C4: "dob", // 304-C4 Date of Birth
  CM: "address", // 322-CM Patient Street Address
  CQ: "phone", // 326-CQ Patient Phone Number
  CY: "id", // 332-CY Patient ID (may carry an SSN)
  // Insurance segment (04) — cardholder is the covered person
  C2: "memberid", // 302-C2 Cardholder ID
  CC: "name", // 312-CC Cardholder First Name
  CD: "name", // 313-CD Cardholder Last Name
};

// SCRIPT (XML) leaf tags that carry a person name (patient or prescriber). Matched
// case-insensitively, namespace-prefix-stripped.
const SCRIPT_NAME_TAGS = new Set<string>(["lastname", "firstname", "middlename"]);
// SCRIPT leaf tags that carry an identifier which must be allow-listed if it has a
// real-PHI shape (9-digit SSN, or a bare member/cardholder id).
const SCRIPT_ID_TAGS = new Set<string>([
  "socialsecurity",
  "ssn",
  "cardholderid",
  "memberid",
  "medicaidnumber",
  "medicarenumber",
  "patientaccountnumber",
]);
// SCRIPT leaf tags that carry a street-address line.
const SCRIPT_ADDRESS_TAGS = new Set<string>(["addressline1", "addressline2", "addressline"]);
// SCRIPT leaf tags that carry a phone / fax number.
const SCRIPT_PHONE_TAGS = new Set<string>(["number", "phonenumber", "telephone"]);

// Name-noise tokens (degrees / suffixes / prefixes) — extracted alongside real
// name tokens and skipped. Never a person's identifying name.
const NAME_NOISE_TOKENS = new Set<string>([
  "MD",
  "DO",
  "DR",
  "MR",
  "MRS",
  "MS",
  "JR",
  "SR",
  "II",
  "III",
  "IV",
  "RN",
  "NP",
  "PA",
  "PHD",
  "DDS",
  "DMD",
  "ESQ",
  "PROF",
  "FNP",
  "APRN",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Hit {
  path: string;
  segment: string; // location tag (e.g. "CA" / "<LastName>" / "(ssn)")
  value: string;
  reason: string;
}

interface AllowList {
  /** Uppercase synthetic person-name tokens. */
  names: Set<string>;
  /** Synthetic dates of birth, normalized (YYYYMMDD / YYYYMM / YYYY). */
  dobs: Set<string>;
  /** Synthetic street-address lines, lower-cased. */
  addresses: Set<string>;
  /** Synthetic id values (SSN / member / cardholder shapes), upper-cased. */
  ids: Set<string>;
  /** Allowed email domains (anything else is a hit). */
  emailDomains: Set<string>;
}

interface Args {
  mode: "all" | "staged" | "paths";
  paths: string[];
  allowFixtures: string[];
}

class InvocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvocationError";
  }
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Args {
  let staged = false;
  const paths: string[] = [];
  const allowFixtures: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === "--") {
      for (let j = i + 1; j < argv.length; j += 1) {
        const v = argv[j];
        if (v !== undefined) paths.push(v);
      }
      break;
    } else if (a === "--staged") {
      staged = true;
      i += 1;
    } else if (a === "--allow-fixture") {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new InvocationError("--allow-fixture requires a path argument");
      }
      allowFixtures.push(next);
      i += 2;
    } else if (a !== undefined && a.startsWith("--")) {
      throw new InvocationError(`Unknown flag: ${a}`);
    } else if (a !== undefined) {
      paths.push(a);
      i += 1;
    } else {
      i += 1;
    }
  }

  if (staged && paths.length > 0) {
    throw new InvocationError("--staged cannot be combined with positional paths");
  }

  // An `--allow-fixture` path is a *subtractive* acknowledgement on a broader
  // scan, never a scan target on its own — so it also seeds the positional path
  // set. That makes `--allow-fixture X` mean "scan X, but allow it" (proving the
  // override gate actually subtracts a scanned target) instead of a silent no-op.
  const scanPaths = paths.length > 0 ? paths : [...allowFixtures];

  let mode: Args["mode"];
  if (staged) {
    mode = "staged";
  } else if (scanPaths.length > 0) {
    mode = "paths";
  } else {
    mode = "all";
  }
  return { mode, paths: scanPaths, allowFixtures };
}

// ---------------------------------------------------------------------------
// Allow-list + override log
// ---------------------------------------------------------------------------

function loadAllowList(): AllowList {
  if (!existsSync(ALLOW_LIST_PATH)) {
    throw new InvocationError(`allow-list not found at ${ALLOW_LIST_PATH}`);
  }
  const raw = readFileSync(ALLOW_LIST_PATH, "utf8");
  const names = new Set<string>();
  const dobs = new Set<string>();
  const addresses = new Set<string>();
  const ids = new Set<string>();
  const emailDomains = new Set<string>();
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const sp = line.indexOf(" ");
    if (sp < 0) continue;
    const tag = line.slice(0, sp);
    const value = line.slice(sp + 1).trim();
    if (value.length === 0) continue;
    switch (tag) {
      case "NAME":
        names.add(value.toUpperCase());
        break;
      case "DOB":
        dobs.add(value);
        break;
      case "ADDR":
        addresses.add(value.toLowerCase());
        break;
      case "ID":
        ids.add(value.toUpperCase());
        break;
      case "EMAILDOMAIN":
        emailDomains.add(value.toLowerCase());
        break;
      default:
        break;
    }
  }
  return { names, dobs, addresses, ids, emailDomains };
}

function normalizePath(p: string): string {
  const abs = isAbsolute(p) ? p : resolve(REPO_ROOT, p);
  const rel = relative(REPO_ROOT, abs);
  return rel.split(sep).join("/");
}

function loadOverrideLog(): Set<string> {
  if (!existsSync(OVERRIDE_LOG_PATH)) return new Set();
  const raw = readFileSync(OVERRIDE_LOG_PATH, "utf8");
  const out = new Set<string>();
  // Only `### <path>` subsections UNDER the "## Entries" heading are real override
  // entries. The doc above that heading (the detection map, the `### <path>`
  // format template) also uses `###` headings — parsing those as allowed paths
  // would let a fixture named to collide with a doc heading be silently bypassed.
  let inEntries = false;
  for (const lineRaw of raw.split(/\r?\n/)) {
    if (/^##\s+Entries\s*$/.test(lineRaw)) {
      inEntries = true;
      continue;
    }
    if (!inEntries) continue;
    const m = /^###\s+(.+?)\s*$/.exec(lineRaw);
    if (m && m[1] !== undefined) out.add(normalizePath(m[1]));
  }
  return out;
}

function validateAllowFixtures(allowFixtures: string[]): void {
  if (allowFixtures.length === 0) return;
  const overrides = loadOverrideLog();
  const missing = allowFixtures.map(normalizePath).filter((p) => !overrides.has(p));
  if (missing.length > 0) {
    const lines = missing.map((p) => `  - ${p}`).join("\n");
    throw new InvocationError(
      `--allow-fixture rejected: no matching entry in phi-scan-overrides.md for:\n${lines}\n` +
        `Add a "### <path>" subsection to phi-scan-overrides.md and commit it.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Target enumeration
// ---------------------------------------------------------------------------

interface Target {
  path: string; // forward-slash repo-relative path for reporting
  read: () => Buffer;
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out);
    } else if (e.isFile()) {
      // README/markdown docs may legitimately describe violator values; they
      // are documentation, not fixtures.
      if (e.name.toLowerCase().endsWith(".md")) continue;
      out.push(full);
    }
  }
}

function gitIgnored(paths: string[]): Set<string> {
  const ignored = new Set<string>();
  if (paths.length === 0) return ignored;
  try {
    // SECURITY: array-form execFileSync, no shell. Default (Buffer) encoding —
    // `encoding: "buffer"` with `input` is rejected by Node.
    const out = execFileSync("git", ["check-ignore", "--stdin", "-z"], {
      input: paths.map(normalizePath).join("\0"),
      stdio: ["pipe", "pipe", "ignore"],
    });
    for (const p of out.toString("utf8").split("\0")) {
      if (p.length > 0) ignored.add(p);
    }
  } catch {
    // `git check-ignore` exits 1 when nothing matches — treat as none ignored.
  }
  return ignored;
}

function buildTargetsForAll(): Target[] {
  const files: string[] = [];
  walk(FIXTURE_ROOT, files);
  walk(SRC_ROOT, files);
  const ignored = gitIgnored(files);
  return files
    .filter((abs) => !ignored.has(normalizePath(abs)))
    .map((abs) => ({ path: normalizePath(abs), read: () => readFileSync(abs) }));
}

function buildTargetsForPaths(paths: string[]): Target[] {
  return paths.map((p) => {
    const abs = isAbsolute(p) ? p : resolve(REPO_ROOT, p);
    if (!existsSync(abs)) throw new InvocationError(`File not found: ${p}`);
    if (!statSync(abs).isFile()) throw new InvocationError(`Not a regular file: ${p}`);
    return { path: normalizePath(abs), read: () => readFileSync(abs) };
  });
}

function buildTargetsForStaged(): Target[] {
  let listBuf: Buffer;
  try {
    // SECURITY: array-form execFileSync, no shell.
    listBuf = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=AM", "-z"], {
      encoding: "buffer",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    throw new InvocationError(
      `git diff --cached failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const list = listBuf
    .toString("utf8")
    .split("\0")
    .filter((p) => p.length > 0)
    .filter((p) => p.startsWith("test/fixtures/") || (p.startsWith("src/") && p.endsWith(".ts")));
  return list.map((relPath) => ({
    path: relPath,
    // SECURITY: array-form execFileSync, no shell. `:<path>` is a git pathspec.
    read: (): Buffer =>
      execFileSync("git", ["show", `:${relPath}`], {
        encoding: "buffer",
        stdio: ["ignore", "pipe", "pipe"],
      }),
  }));
}

// ---------------------------------------------------------------------------
// Shared value helpers
// ---------------------------------------------------------------------------

/** Escape/unicode-aware name tokenizer: significant word tokens only. */
function nameTokens(value: string): string[] {
  const out: string[] = [];
  for (const raw of value.split(/[^\p{L}]+/u)) {
    if (raw.length === 0) continue;
    if (!/\p{L}/u.test(raw)) continue;
    // A single Latin letter is a middle initial — not identifying. A single CJK
    // ideograph / kana / hangul IS a name (Chinese/Korean surnames are 1 char).
    const isCjk = /[぀-ヿ㐀-鿿가-힯]/u.test(raw);
    if (raw.length < 2 && !isCjk) continue;
    out.push(raw);
  }
  return out;
}

function isNameToken(tok: string): boolean {
  return !NAME_NOISE_TOKENS.has(tok.toUpperCase());
}

/**
 * Whether a value carries a date signal (a 4-digit year run, ≥6 digits total, or a
 * month-name token). Used to fail CLOSED in a DOB-scoped field: a value the
 * normalizer cannot parse but that still looks date-ish must be flagged, not
 * silently accepted — otherwise a real DOB in a non-year-first rendering
 * (`07/07/1977`, `13.11.1975`, `November 30, 1975`, `30-NOV-1975`) slips through.
 * An empty / `UNK` DOB field carries no signal and is not flagged.
 */
function hasDateSignal(value: string): boolean {
  if (/\d{4}/.test(value)) return true;
  if (value.replace(/\D/g, "").length >= 6) return true;
  return /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(value);
}

/** Normalize a date-ish value to YYYYMMDD / YYYYMM / YYYY, or null if implausible. */
function normalizeDob(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 8) {
    const d = digits.slice(0, 8);
    const month = Number(d.slice(4, 6));
    const day = Number(d.slice(6, 8));
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return d;
  }
  if (/^\d{6}$/.test(digits)) {
    const month = Number(digits.slice(4, 6));
    if (month < 1 || month > 12) return null;
    return digits; // YYYYMM month precision
  }
  if (/^\d{4}$/.test(digits)) return digits; // year-only precision
  return null;
}

function checkName(path: string, loc: string, value: string, allow: AllowList, hits: Hit[]): void {
  for (const tok of nameTokens(value)) {
    if (!isNameToken(tok)) continue;
    if (!allow.names.has(tok.toUpperCase())) {
      hits.push({
        path,
        segment: loc,
        value: tok,
        reason: "person-name token not in synthetic allow-list",
      });
    }
  }
}

function checkDob(path: string, loc: string, value: string, allow: AllowList, hits: Hit[]): void {
  // `checkDob` is only ever called on a location whose context already establishes
  // the value IS a date of birth (SCRIPT `<DateOfBirth>`, Telecom 304-C4), so it
  // must fail CLOSED: a value we cannot normalize but that still looks date-ish is
  // a hit, not a silent accept.
  const dob = normalizeDob(value);
  if (dob === null) {
    if (hasDateSignal(value)) {
      hits.push({
        path,
        segment: loc,
        value,
        reason:
          "unrecognized date-of-birth shape in a DOB field (normalize to CCYYMMDD if synthetic)",
      });
    }
    return;
  }
  if (!allow.dobs.has(dob)) {
    hits.push({
      path,
      segment: loc,
      value: dob,
      reason: "date of birth not in synthetic allow-list",
    });
  }
}

function checkAddress(
  path: string,
  loc: string,
  value: string,
  allow: AllowList,
  hits: Hit[],
): void {
  const street = value.trim();
  // A street line: house number + at least one word (`742 Evergreen Terrace`).
  if (!/^\d+\s+\p{L}/u.test(street)) return;
  if (!allow.addresses.has(street.toLowerCase())) {
    hits.push({
      path,
      segment: loc,
      value: street,
      reason: "street address not in synthetic allow-list",
    });
  }
}

function checkPhone(path: string, loc: string, value: string, hits: Hit[]): void {
  const digits = value.replace(/\D/g, "");
  // A real dialable number is >= 10 digits. The `555` fake-exchange convention
  // (555-01xx is reserved for fiction) marks a synthetic number.
  if (digits.length >= 10 && !digits.includes("555")) {
    hits.push({
      path,
      segment: loc,
      value,
      reason: "phone number without the 555 fake-exchange convention",
    });
  }
}

/** An id-shaped value: 9-digit SSN, or a bare 6-15 digit member/cardholder id. */
function checkId(
  path: string,
  loc: string,
  value: string,
  reason: string,
  allow: AllowList,
  hits: Hit[],
): void {
  const v = value.trim();
  if (v.length === 0) return;
  if (allow.ids.has(v.toUpperCase())) return;
  const digits = v.replace(/\D/g, "");
  // A bare all-digit id of realistic length is a real-looking SSN / member id.
  // Synthetic fixtures use prefixed shapes (SYNTH…, FAKE…, TEST…), which pass.
  if (/^\d{6,15}$/.test(v) || (v.length === digits.length && digits.length >= 6)) {
    hits.push({ path, segment: loc, value: v, reason });
  }
}

// ---------------------------------------------------------------------------
// Shape checks shared by every target
// ---------------------------------------------------------------------------

function scanCommonShapes(path: string, content: string, allow: AllowList, hits: Hit[]): void {
  // Dashed SSN anywhere (covers free-text notes and non-NCPDP targets).
  for (const m of content.matchAll(/\b\d{3}-\d{2}-\d{4}\b/g)) {
    hits.push({ path, segment: "(ssn)", value: m[0], reason: "dashed SSN pattern" });
  }
  // Emails whose domain is not an allow-listed reserved / test domain.
  for (const m of content.matchAll(/\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g)) {
    const domain = (m[1] ?? "").toLowerCase();
    if (!allow.emailDomains.has(domain)) {
      hits.push({ path, segment: "(email)", value: m[0], reason: "email with non-test domain" });
    }
  }
}

// ---------------------------------------------------------------------------
// SCRIPT (XML) scanner — element-stack walk, tag-scoped detection
// ---------------------------------------------------------------------------

/** A decoded leaf element: its (lower-cased) tag, its parent tag, and its text. */
interface XmlLeaf {
  tag: string;
  parent: string;
  text: string;
  /** The element's local name with original case preserved (for reporting). */
  rawTag: string;
}

/**
 * Minimal, dependency-free XML leaf walker. Yields the text of every leaf element
 * with its own tag and its parent's tag (both lower-cased, namespace-prefix
 * stripped). Deliberately independent of the package's `fast-xml-parser` so a
 * shared parse bug cannot blind the safety gate. Handles comments, CDATA,
 * processing instructions, self-closing tags, and attributes.
 */
function walkXmlLeaves(xml: string): XmlLeaf[] {
  const leaves: XmlLeaf[] = [];
  const stack: { lower: string; raw: string }[] = [];
  let i = 0;
  let text = "";
  const n = xml.length;
  const localName = (raw: string): string => {
    const name = raw.trim().split(/[\s/]/)[0] ?? "";
    const colon = name.indexOf(":");
    return colon >= 0 ? name.slice(colon + 1) : name;
  };
  const flushText = (tag: string, rawTag: string, parent: string): void => {
    const t = text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
    if (t.length > 0) leaves.push({ tag, parent, text: t, rawTag });
    text = "";
  };
  while (i < n) {
    const lt = xml.indexOf("<", i);
    if (lt < 0) {
      text += xml.slice(i);
      break;
    }
    text += xml.slice(i, lt);
    if (xml.startsWith("<!--", lt)) {
      const end = xml.indexOf("-->", lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", lt)) {
      const end = xml.indexOf("]]>", lt + 9);
      text += end < 0 ? xml.slice(lt + 9) : xml.slice(lt + 9, end);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (xml.startsWith("<?", lt) || xml.startsWith("<!", lt)) {
      const end = xml.indexOf(">", lt + 1);
      i = end < 0 ? n : end + 1;
      continue;
    }
    const gt = xml.indexOf(">", lt + 1);
    if (gt < 0) break;
    const inner = xml.slice(lt + 1, gt);
    if (inner.startsWith("/")) {
      // Closing tag: text collected since the open tag is this element's leaf text.
      const top = stack.pop();
      const parent = stack[stack.length - 1]?.lower ?? "";
      flushText(top?.lower ?? "", top?.raw ?? "", parent);
    } else if (inner.endsWith("/")) {
      // Self-closing tag: no text content.
      text = "";
    } else {
      // Opening tag: any text before it belonged to the parent as mixed content
      // (not a clean leaf) — drop it and start fresh for this element.
      text = "";
      const raw = localName(inner);
      stack.push({ lower: raw.toLowerCase(), raw });
    }
    i = gt + 1;
  }
  return leaves;
}

function scanScript(target: Target, xml: string, allow: AllowList, hits: Hit[]): void {
  for (const leaf of walkXmlLeaves(xml)) {
    const loc = `<${leaf.rawTag}>`;
    if (SCRIPT_NAME_TAGS.has(leaf.tag)) {
      checkName(target.path, loc, leaf.text, allow, hits);
    } else if (
      leaf.tag === "dateofbirth" ||
      (leaf.tag === "date" && leaf.parent === "dateofbirth")
    ) {
      checkDob(target.path, "<DateOfBirth>", leaf.text, allow, hits);
    } else if (SCRIPT_ID_TAGS.has(leaf.tag)) {
      checkId(
        target.path,
        loc,
        leaf.text,
        `identifier (${loc}) not in synthetic allow-list`,
        allow,
        hits,
      );
    } else if (SCRIPT_ADDRESS_TAGS.has(leaf.tag)) {
      checkAddress(target.path, loc, leaf.text, allow, hits);
    } else if (SCRIPT_PHONE_TAGS.has(leaf.tag) && leaf.parent === "communicationnumber") {
      checkPhone(target.path, loc, leaf.text, hits);
    } else if (leaf.tag === "phonenumber" || leaf.tag === "telephone") {
      checkPhone(target.path, loc, leaf.text, hits);
    }
  }
  // Cross-cutting shape checks over the whole payload (free-text notes, etc.).
  scanCommonShapes(target.path, xml, allow, hits);
}

// ---------------------------------------------------------------------------
// Telecom (delimited) scanner — field-id keyed detection
// ---------------------------------------------------------------------------

function scanTelecom(target: Target, text: string, allow: AllowList, hits: Hit[]): void {
  // Tokenize on the union of the three NCPDP separators. Each resulting token is
  // a `<2-char field id><value>` pair; the leading fixed header (which carries no
  // separators, so it is one token) has no PHI field id and is ignored — patient
  // PHI lives only in the field-id-keyed segments, never in the routing header.
  for (const token of text.split(/[\x1c\x1d\x1e]/)) {
    if (token.length < 2) continue;
    const id = token.slice(0, 2);
    const category = TELECOM_PHI_FIELDS[id];
    if (category === undefined) continue;
    const value = token.slice(2);
    const loc = id;
    switch (category) {
      case "name":
        checkName(target.path, loc, value, allow, hits);
        break;
      case "dob":
        checkDob(target.path, loc, value, allow, hits);
        break;
      case "address":
        checkAddress(target.path, loc, value, allow, hits);
        break;
      case "phone":
        checkPhone(target.path, loc, value, hits);
        break;
      case "id":
        checkId(
          target.path,
          loc,
          value,
          `patient identifier (${id}) not in synthetic allow-list`,
          allow,
          hits,
        );
        break;
      case "memberid":
        checkId(
          target.path,
          loc,
          value,
          `cardholder / member id (${id}) not in synthetic allow-list`,
          allow,
          hits,
        );
        break;
      default:
        break;
    }
  }
  scanCommonShapes(target.path, text, allow, hits);
}

// ---------------------------------------------------------------------------
// Format detection + dispatch
// ---------------------------------------------------------------------------

type Format = "script" | "telecom" | "none";

/**
 * Classify a fixture-like target. Only files under `test/fixtures/` (or with a
 * `.xml` / `.ncpdp` extension) get a structural scan; everything else (hand-written
 * `src/`) gets the conservative shape pass. Detection is content-first so a
 * mis-extensioned fixture is still parsed:
 *   - a Telecom message carries the NCPDP control-char separators;
 *   - a SCRIPT message is XML (starts with `<`, has an element tree).
 */
function detectFormat(text: string, path: string): Format {
  const isFixtureLike =
    path.startsWith("test/fixtures/") || path.endsWith(".ncpdp") || path.endsWith(".xml");
  if (!isFixtureLike) return "none";
  const t = text.replace(/^\uFEFF/, "");
  if (path.endsWith(".ncpdp") || /[\x1c\x1d\x1e]/.test(t)) return "telecom";
  if (
    path.endsWith(".xml") ||
    (t.trimStart().startsWith("<") && /<[A-Za-z][\w:.-]*[\s/>]/.test(t))
  ) {
    return "script";
  }
  return "none";
}

function scanTarget(target: Target, allow: AllowList, hits: Hit[]): void {
  let buf: Buffer;
  try {
    buf = target.read();
  } catch (err) {
    throw new InvocationError(
      `could not read ${target.path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const text = buf.toString("utf8");
  const fmt = detectFormat(text, target.path);
  if (fmt === "script") {
    scanScript(target, text, allow, hits);
  } else if (fmt === "telecom") {
    scanTelecom(target, text, allow, hits);
  } else {
    // Non-NCPDP target (hand-written src, plain-text notes): conservative shape
    // pass only — no structural model to lean on.
    scanCommonShapes(target.path, text, allow, hits);
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(hits: Hit[]): void {
  if (hits.length === 0) {
    process.stdout.write("[phi-scan] OK — no hits\n");
    return;
  }
  const byPath = new Map<string, Hit[]>();
  for (const h of hits) {
    const arr = byPath.get(h.path);
    if (arr) arr.push(h);
    else byPath.set(h.path, [h]);
  }
  for (const [path, group] of byPath) {
    process.stderr.write(`[phi-scan] HIT: ${path}\n`);
    for (const h of group) {
      process.stderr.write(
        `  location=${h.segment} value=${JSON.stringify(h.value)} (${h.reason})\n`,
      );
    }
  }
  process.stderr.write(
    `[phi-scan] ${String(hits.length)} hit(s) across ${String(byPath.size)} file(s). ` +
      `If a value is genuinely synthetic, declare it in scripts/phi-allow-list.txt OR ` +
      `run with --allow-fixture <path> AND log it in phi-scan-overrides.md.\n`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
    validateAllowFixtures(args.allowFixtures);
  } catch (err) {
    if (err instanceof InvocationError) {
      process.stderr.write(`[phi-scan] ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  const allow = loadAllowList();
  const allowed = new Set<string>(args.allowFixtures.map(normalizePath));

  let targets: Target[];
  try {
    if (args.mode === "staged") targets = buildTargetsForStaged();
    else if (args.mode === "paths") targets = buildTargetsForPaths(args.paths);
    else targets = buildTargetsForAll();
  } catch (err) {
    if (err instanceof InvocationError) {
      process.stderr.write(`[phi-scan] ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  targets = targets.filter((t) => !allowed.has(t.path));

  const hits: Hit[] = [];
  for (const t of targets) {
    try {
      scanTarget(t, allow, hits);
    } catch (err) {
      if (err instanceof InvocationError) {
        process.stderr.write(`[phi-scan] ${err.message}\n`);
        return 2;
      }
      throw err;
    }
  }

  report(hits);
  return hits.length === 0 ? 0 : 1;
}

process.exit(main());
