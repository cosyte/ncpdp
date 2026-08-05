#!/usr/bin/env tsx
/**
 * `@cosyte/ncpdp` PHI scanner: the CI / pre-commit half of the PHI commit-gate.
 *
 * Pure Node. Zero runtime deps (the scanner does NOT reuse the package's own
 * `fast-xml-parser`: a safety gate must be independent of the code it guards, so
 * a shared parser bug cannot blind both). Walks `src/`, `test/` and `scripts/`
 * (see `SCAN_ROOTS`) and REFUSES anything that looks like real PHI, so a developer
 * cannot commit a real-looking NCPDP fixture by accident. A payload that IS an
 * NCPDP message gets the full NCPDP-aware structural scan wherever it lives and
 * whatever it is called (`detectFormats` reads the bytes, not the file name, and a
 * payload that signals BOTH formats is scanned as both); everything else gets a
 * conservative text pass.
 *
 * NCPDP is TWO structurally unrelated wire formats under one brand, and this
 * scanner covers BOTH:
 *   - **SCRIPT** (ePrescribing): XML. PHI lives in named elements: `<LastName>` /
 *     `<FirstName>` (patient AND prescriber), `<DateOfBirth><Date>`, `<Address>`
 *     lines, `<SocialSecurity>` / member-id elements, and free-text notes.
 *   - **Telecom Standard** (pharmacy claims): control-char-delimited, field-id
 *     keyed (FS `0x1C` / GS `0x1D` / RS `0x1E`). PHI lives in 2-character field
 *     ids: Patient First/Last Name (`CA`/`CB`), Date of Birth (`C4`), Patient
 *     Street Address (`CM`), Patient Phone (`CQ`), Patient ID (`CY`), and the
 *     Insurance Cardholder ID (`C2`).
 *
 * Neither format can carry an inline `# synthetic: true` header (SCRIPT is XML;
 * Telecom is byte-framed): the same constraint HL7, DICOM (binary `.dcm`), and
 * X12 (byte-strict `.edi`) hit, so we solve it the same proven way: a **synthetic
 * allow-list** (`scripts/phi-allow-list.txt`) is the positive declaration that a
 * fixture's identifiers are fake. Any realistic-PHI-shaped token not covered by
 * the allow-list is a hit. Adding a new synthetic fixture therefore means either
 * reusing known-synthetic tokens or consciously extending the allow-list: a
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
 * our own paraphrased category labels: no NCPDP-copyrighted spec prose.
 *
 * SECURITY: every subprocess is `git`, invoked via `execFileSync` with array
 * args only. Never shell-form spawn.
 *
 * Modes:
 *   --staged                 - scan only files staged in `git diff --cached`
 *   --allow-fixture <path>   - SUBTRACT one already-enumerated path from the scan;
 *                              rejected unless logged in phi-scan-overrides.md
 *   <path> [<path>...]       - scan specific paths
 *   (no args)                - scan all in-scope working-tree files
 *
 * Exit codes: 0 (clean), 1 (hits found), 2 (invocation error).
 *
 * A SCAN THAT OBSERVES NOTHING MUST NOT REPORT OK. A safety gate that can be
 * collapsed to an empty target set is worse than no gate, because it prints the
 * same `OK` a real pass prints. Three invariants close the argument-driven routes
 * to that, and every one is checked before any hit counting (`enforceObservation`):
 *
 *   1. `--allow-fixture` is PURELY SUBTRACTIVE and never seeds the target set.
 *      Seeding it meant `--allow-fixture X` with no positional path expanded to
 *      "scan [X], then subtract X" = scan nothing, exit 0.
 *   2. Every `--allow-fixture` path must actually subtract an enumerated target.
 *      An override that matches nothing is inert: the operator believes a bypass
 *      is in effect when it is not, and a stale override log drifts unnoticed.
 *   3. The post-subtraction target set must be non-empty whenever the
 *      pre-subtraction set was, and the pre-subtraction set must be non-empty in
 *      every mode but `--staged` (where "nothing staged" is legitimate).
 *
 * Every report line carries the DENOMINATOR (files scanned), so an `OK` is never
 * read without the number it is an `OK` over.
 *
 * A SCAN THAT COULD NOT READ WHAT IT ENUMERATED REFUSES, for the same reason. All
 * mode lists the tree first and reads each file afterwards, so a file can be
 * deleted inside that window and the read throws `ENOENT`. Exactly ONE case is
 * tolerated (`Target.tolerateVanish`): a file the walk enumerated ITSELF, that git
 * does NOT track, failing with `ENOENT`. It is reported on stderr as skipped and
 * subtracted from the denominator, never dropped silently. A tracked file, any
 * non-`ENOENT` failure, a tolerated file back on disk at sweep end, a `git` that
 * cannot answer, and an empty tracked set all still refuse, and all mode refuses
 * outright if it ended up observing nothing.
 *
 * What those invariants do NOT cover, because the honest limits matter more
 * than the slogan: they constrain the target set, not what enumeration finds in
 * the first place. A file the enumerator never lists is invisible to all of them and
 * the denominator counts the files that WERE listed, so it still reads plausible.
 * The gaps we KNOW of are written up in `phi-scan-overrides.md` (a scan of one
 * named in-scope file truthfully reports `1 file(s) scanned`; a message embedded in
 * a string literal is not structurally scanned). THIS IS NOT A CLOSED LIST, and
 * saying otherwise has now been wrong twice: the staged enumerator turned out to be
 * dropping renames, and then typechanges, both because `--diff-filter` was an
 * allow-list of status letters. Treat any change to what the enumerator lists as a
 * change to the gate itself, and prefer exclusion lists to allow-lists there.
 *
 * ---------------------------------------------------------------------------
 * AN IN-SCOPE ENTRY THAT IS NOT A REGULAR FILE REFUSES THE SCAN (exit 2). It is
 * never silently skipped, because BOTH enumerating routes read such an entry as
 * clean, by two different mechanisms:
 *
 *   - the walk enumerates `Dirent.isFile()`, which is an lstat answer, so a
 *     symbolic link is neither a file nor a directory and fell out of the loop
 *     with no branch of its own. `isDirectory()` is false for a LINKED DIRECTORY
 *     too, so a whole subtree disappeared the same way;
 *   - `--staged` reads content with `git show :<path>`, and git stores a symbolic
 *     link as its TARGET PATH under mode `120000`, so that route was handed the
 *     path text and never the target's bytes. That route is the pre-commit hook.
 *
 * MEASURED ON `6c901e8`, with a synthetic name-bearing SCRIPT payload written
 * OUTSIDE the scan roots and a link to it under `test/fixtures/script/`: all mode
 * printed `OK: no hits (2 file(s) scanned)` and exited 0; `--staged` printed
 * `OK: no hits (1 file(s) scanned)` and exited 0 after `git add`; and naming the
 * link explicitly exited 1 with both name hits. The payload was always detectable.
 * The two ENUMERATING routes never looked at it.
 *
 * Neither route is made to FOLLOW the link. Following would read bytes the
 * enumeration does not control (outside the repo, a loop, a device, a FIFO that
 * blocks the gate forever), and git does not carry those bytes anyway, so a hit on
 * them would be a claim about something no commit contains. Refusing states the
 * only true thing available: there is an entry here the scan cannot account for,
 * so the scan is not clean.
 *
 * "In scope" for the refusal is `isUnderScanRoot`, on BOTH routes, and that is a
 * DELIBERATE half-step away from `isScannable`: the `.md` exemption inside
 * `isScannable` is a judgement about a file whose BYTES the scan could have read,
 * and a link's NAME is no evidence at all about what is on the other side. Keeping
 * the two predicates identical made the routes disagree about exactly one entry --
 * MEASURED on a link named `test/fixtures/script/notes.md`, all mode refused
 * (exit 2) while `--staged` printed `OK: no hits (1 file(s) scanned)` and exited 0.
 *
 * Neither route's own PATH scope moves: the walk still starts at `SCAN_ROOTS` and
 * still exempts a gitignored entry (the same rule that already exempts a gitignored
 * file, so a link does not get a second, stricter boundary of its own), and
 * `--staged` still reads only what `isScannable` admits. This narrows what those
 * scopes ADMIT; it does not widen the scopes themselves.
 *
 * A refusal names the entry's own repo-relative path and an engine-owned token for
 * its kind. IT NEVER REPORTS THE LINK TARGET, which is text off the working tree
 * and can itself carry PHI: a target path of the shape
 * `../<dir>/<surname>-<given>-<dob>.txt` is the whole reason. The SHAPE is written
 * out here rather than an example, because a diagnostic ABOUT a PHI leak is itself
 * a PHI surface, and that applies to the prose explaining it too.
 *
 * Explicit-paths mode is deliberately UNCHANGED: `statSync` and `readFileSync`
 * both follow links, so naming a link reads the target's real bytes, which is what
 * a human asking for one file by name means. It is the two routes that enumerate
 * on their own that had to be narrowed.
 * ---------------------------------------------------------------------------
 * A DECLARED SCAN ROOT THAT THE WALK CANNOT ENUMERATE REFUSES (exit 2). It is never
 * silently skipped, because the other roots go on supplying a PLAUSIBLE DENOMINATOR
 * and the report reads exactly like a real pass.
 *
 * MEASURED ON `5e2b42b`, with `src/` (51 tracked files) moved out of the tree: all
 * mode printed `OK: no hits (71 file(s) scanned)` and exited 0. With `src/` replaced
 * by a DANGLING SYMBOLIC LINK: byte-identical, `OK: no hits (71 file(s) scanned)`,
 * exit 0.
 *
 * THE COUNT IS NOT THE RULE. This scanner has printed a denominator since the
 * argument-driven collapse routes were closed, and it did not help here: 71 is a
 * number nothing about the report makes look wrong. A denominator is a count of the
 * roots that DID exist, so it cannot witness a root that did not. Checking the roots
 * is a DIFFERENT rule, and it had to be written separately.
 *
 * THE DANGLING CASE IS WHY THE CHECK IS `lstatSync`. `existsSync` FOLLOWS a link and
 * answers false for a dangling one, so `walk` returned before `readdirSync` ever ran
 * and the non-regular-entry refusal above never fired -- that rule classifies entries
 * found INSIDE a root, and a root is not inside itself. The two refusals therefore
 * read the filesystem through different calls and keep separate closed-set kind
 * vocabularies (`direntKind`, `statsKind`), and NEITHER ever prints a link target.
 *
 * A root is a DECLARATION; a subdirectory found inside one is a DISCOVERY. That
 * distinction is the whole design: a false declaration refuses, while a subdirectory
 * that vanishes mid-walk stays in the tolerated-transient class. See `walkRoot`.
 *
 * EXIT CODES ARE DERIVED HERE, NEVER PORTED. A root that is a regular file used to
 * escape as an uncaught `ENOTDIR` and exit **1**, which this scanner's own contract
 * reads as "hits found". The same shape exits **2** in `hl7` and **1** in
 * `terminology`; the number is a fact about each repo's `walk`, not about the defect.
 * The two other uncaught-throw routes measured alongside it (an unreadable root, an
 * unreadable allow-list) exited 1 for the same reason and are now `InvocationError`s.
 * ---------------------------------------------------------------------------
 * EXISTENCE IS NOT OBSERVATION. The rule above certifies that every declared root is
 * present and enumerable. It cannot certify that anything was FOUND under one, and no
 * version of it ever could: AN EMPTY DIRECTORY ENUMERATES PERFECTLY. So an all-mode
 * sweep additionally RECONCILES the paths it actually opened against `git ls-files`,
 * and REFUSES (exit 2) naming every tracked in-scope file it did not open. See
 * `unobservedTracked` / `refuseUnobserved`.
 *
 * MEASURED in a local clone at `16c2fea`, with the root rule already in place and
 * passing: healthy control `OK: no hits (122 file(s) scanned)` exit 0; `src/` EMPTIED
 * (the directory still there) `OK: no hits (71 file(s) scanned)` exit 0 with 51
 * tracked files unopened; `src/telecom/` deleted alone `OK: no hits (105 file(s)
 * scanned)` exit 0 with 17 unopened.
 *
 * A DENOMINATOR CANNOT DETECT THIS, and it is the second time that has had to be
 * written down here. 71 next to a healthy 122 is not a number anything about the
 * report makes look wrong, because a count counts the files that WERE found. The fix
 * cannot be a better count; it has to be a comparison against a statement of the
 * corpus that DOES NOT COME FROM THE WALK. `git ls-files` is that statement: the walk
 * reads directory entries, git reads the index, and emptying a directory on disk
 * moves only the first. Anything re-derived from the walk would agree with the walk
 * forever, so the suite's load-bearing case is the negative control that runs the
 * SAME missing file twice, tracked and untracked, and demands opposite verdicts.
 *
 * IT FAILS CLOSED WHEN GIT CANNOT ANSWER. With no tracked set there is no independent
 * statement of the corpus, so all mode refuses rather than skipping the reconciliation
 * (measured pre-fix with `.git` moved aside: `OK: no hits (123 file(s) scanned)`, exit
 * 0). An unanswerable git must not be a way to switch this rule off. `--staged` and
 * paths mode are NOT reconciled: neither claims to have covered the tree.
 *
 * WHAT IT STILL DOES NOT COVER, because this list has never been closed and saying
 * otherwise has been wrong twice: it proves each tracked in-scope file was OPENED and
 * its bytes handed to the dispatch. It says nothing about whether the dispatch then
 * understood them, so residual (a) below (a message embedded in a string literal) is
 * untouched.
 *
 * THE NESTED-CHECKOUT SHAPE WAS MEASURED RATHER THAN ASSUMED, because a sibling gate
 * elsewhere scanned zero files and passed that way. `git ls-files` is run with the
 * scanner's cwd and reports paths RELATIVE TO IT, which is why it composes correctly
 * here where `git rev-parse --is-inside-work-tree` (which answers for the ENCLOSING
 * repo) would not. Three sub-cases, measured: a copy nested inside another repo
 * and NOT tracked by it gets an empty answer and REFUSES (fail closed); a copy that IS
 * tracked by the outer repo reconciles normally (`OK: no hits (4 file(s) scanned)`,
 * exit 0); and the same tracked copy with `src/` emptied REFUSES and names the file.
 * Do not replace the `ls-files` call with a work-tree probe.
 *
 * A FOURTH NESTED SUB-CASE IS A RESIDUAL, stated here rather than implied closed: the
 * fail-closed test is `tracked.size > 0` in `gitTracked()`, which is a PRESENCE test,
 * not a COVERAGE test. One tracked file anywhere switches this rule fully on even
 * where the answering index covers almost nothing of the tree. MEASURED: a checkout
 * with no `.git` of its own, nested in a repo tracking only `test/t.ts`, with `src/`
 * emptied, printed `OK: no hits (3 file(s) scanned)` and exited 0 with two files
 * unopened. The rule's literal claim survives (neither file was tracked by the index
 * that answered), so this is not a false green against its own bar, but the coverage
 * is narrower than "the nested shape is handled" would suggest. NOT live for this
 * repo: it has its own `.git`, and `actions/checkout` supplies one in CI.
 * ---------------------------------------------------------------------------
 */

import {
  readFileSync,
  statSync,
  lstatSync,
  existsSync,
  readdirSync,
  type Dirent,
  type Stats,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, sep, isAbsolute } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();
const ALLOW_LIST_PATH = join(REPO_ROOT, "scripts", "phi-allow-list.txt");
const OVERRIDE_LOG_PATH = join(REPO_ROOT, "phi-scan-overrides.md");

// The scan roots, as repo-relative prefixes. ONE list, used by BOTH "all" mode
// (which walks them) and "--staged" mode (which filters the staged set by them),
// so narrowing the scan has exactly one place to happen and is visible there.
//
// `test/` is walked WHOLE. It used to stop at `test/fixtures/`, which meant every
// test outside `fixtures/` was invisible to the gate even though this repo builds
// Telecom and SCRIPT messages as inline string literals in exactly those files.
// `scripts/` is walked for the same reason: it is tracked, hand-written text that
// can carry a real address or email as easily as a fixture can.
const SCAN_ROOTS: readonly string[] = ["src", "test", "scripts"];

/**
 * Whether a repo-relative path sits under a scan root at all. This is the boundary
 * the NON-REGULAR-ENTRY refusal uses, on BOTH routes: the `.md` exemption below is
 * a judgement about a file whose BYTES the scan could have read, and a link's name
 * is no evidence at all about what is on the other side of it.
 */
function isUnderScanRoot(rel: string): boolean {
  return SCAN_ROOTS.some((root) => rel === root || rel.startsWith(`${root}/`));
}

/**
 * Whether a repo-relative path is in scope for the scan. Markdown is excluded:
 * documentation legitimately quotes violator values (this scanner's own override
 * log and allow-list both do).
 */
function isScannable(rel: string): boolean {
  if (rel.toLowerCase().endsWith(".md")) return false;
  return isUnderScanRoot(rel);
}

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
  // Insurance segment (04): cardholder is the covered person
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

// Name-noise tokens (degrees / suffixes / prefixes): extracted alongside real
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

  // An `--allow-fixture` path is a PURELY SUBTRACTIVE acknowledgement on a
  // broader scan, and never a scan target on its own. It must NOT seed the
  // positional path set: doing so made `--allow-fixture X` (with no positional
  // path) flip the mode to "paths", build the target set `[X]`, subtract `X`, and
  // scan NOTHING while printing `OK: no hits` and exiting 0. The mode is decided
  // by `--staged` and positional paths alone; `--allow-fixture X` on its own now
  // means "scan everything in scope EXCEPT X", which is what it always read as.
  let mode: Args["mode"];
  if (staged) {
    mode = "staged";
  } else if (paths.length > 0) {
    mode = "paths";
  } else {
    mode = "all";
  }
  return { mode, paths, allowFixtures };
}

/**
 * The `errno` string of a Node system error (`ENOENT`, `EACCES`, ...), or
 * `undefined` for anything else. Narrowed with `in` rather than cast, so a thrown
 * non-error cannot masquerade as a system error and widen the tolerance below.
 */
function errorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) return undefined;
  const { code } = err;
  return typeof code === "string" ? code : undefined;
}

// ---------------------------------------------------------------------------
// Allow-list + override log
// ---------------------------------------------------------------------------

function loadAllowList(): AllowList {
  if (!existsSync(ALLOW_LIST_PATH)) {
    throw new InvocationError(`allow-list not found at ${ALLOW_LIST_PATH}`);
  }
  let raw: string;
  try {
    raw = readFileSync(ALLOW_LIST_PATH, "utf8");
  } catch (err) {
    // Present but unreadable (`EACCES`) used to escape as an uncaught throw and exit
    // **1** -- "hits found" -- for a run that never got as far as scanning anything.
    // The missing case above is already an `InvocationError`; this is its twin.
    throw new InvocationError(
      `allow-list at ${ALLOW_LIST_PATH} could not be read ` +
        `(${(err as NodeJS.ErrnoException).code ?? "unknown error"}). Without it every ` +
        `synthetic token would read as a hit, so the scan refuses rather than guessing.`,
    );
  }
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
  let raw: string;
  try {
    raw = readFileSync(OVERRIDE_LOG_PATH, "utf8");
  } catch (err) {
    // The third instance of the same shape, and the one the first survey of this
    // class missed: present but unreadable (`EACCES`) escaped as an uncaught throw
    // and exited **1**, which this scanner's contract reads as "hits found" for a run
    // that never scanned anything. Same remedy as the allow-list twin.
    throw new InvocationError(
      `override log at ${OVERRIDE_LOG_PATH} could not be read ` +
        `(${(err as NodeJS.ErrnoException).code ?? "unknown error"}). An --allow-fixture ` +
        `bypass is only honored against a readable log, so the scan refuses rather ` +
        `than treating the override as unlogged.`,
    );
  }
  const out = new Set<string>();
  // Only `### <path>` subsections UNDER the "## Entries" heading are real override
  // entries. The doc above that heading (the detection map, the `### <path>`
  // format template) also uses `###` headings: parsing those as allowed paths
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
  /**
   * Absolute path, set only for a target the walk enumerated ITSELF, so a file
   * that vanished can be re-checked once the sweep has finished.
   */
  absPath?: string;
  /**
   * TOCTOU: true only for a file the scanner ENUMERATED ITSELF in `all` mode AND
   * that git does not track. `all` mode lists every scan root first and reads each
   * file afterwards, so a transient written inside a root can be deleted inside
   * that window and the read throws `ENOENT`, refusing the whole sweep with exit 2.
   * `SCAN_ROOTS` includes `scripts/`, and this repo's own suite writes violator
   * files under `scripts/` and `test/` and removes them again, so the transient is
   * in-tree rather than hypothetical.
   *
   * Only the ENUMERATION was unsound, never the refusal, so the scope is hard
   * rather than a relaxation of what a failed read means:
   *   - a TRACKED file is never tolerated. The committed corpus is what the gate
   *     promises to have observed, so if a tracked file cannot be read the scan is
   *     incomplete and still refuses (exit 2);
   *   - only `ENOENT` is tolerated. `EACCES`, `EISDIR` and friends are not a file
   *     that went away, they are a scan that failed;
   *   - a tolerated file is re-checked after the sweep. If it is back on disk the
   *     sweep did not observe a file that exists now, so the run refuses;
   *   - a tolerated file is SUBTRACTED from the printed denominator, so the
   *     `N file(s) scanned` count never includes a file nothing was read from;
   *   - `staged` mode reads blobs out of the git index (`git show :path`), so the
   *     pre-commit gate never depends on this at all.
   *
   * RESIDUAL, stated rather than hidden: the re-check is keyed on the PATH the walk
   * enumerated, not on content. An untracked file RENAMED inside the window is
   * `ENOENT` at the old path and was never enumerated under the new one, so its
   * bytes go unscanned under a clean report. It is bounded: the file has to be
   * untracked, so committing it means `git add`, after which it is tracked and
   * untolerable, and pre-commit reads the index either way. Closing it needs a
   * content-addressed sweep, which is a different design, not a wider bound.
   */
  tolerateVanish?: boolean;
}

/**
 * An entry the enumeration reached and cannot scan. BOTH fields are safe to print:
 * `path` is the entry's own repo-relative path (the same locus every hit already
 * carries), and `kind` is a token from the closed set in `direntKind` /
 * `gitModeKind`. Nothing from the other side of a link is ever recorded here, and
 * nothing here is derived from the entry's contents.
 */
interface Unscannable {
  path: string;
  kind: string;
}

/** Closed-set, engine-owned description of a directory entry's kind. */
function direntKind(e: Dirent): string {
  if (e.isSymbolicLink()) return "a symbolic link";
  if (e.isFIFO()) return "a FIFO";
  if (e.isSocket()) return "a socket";
  if (e.isBlockDevice()) return "a block device";
  if (e.isCharacterDevice()) return "a character device";
  return "not a regular file";
}

/**
 * Closed-set, engine-owned description of an `lstat` answer. The `Dirent` twin of
 * this lives in `direntKind`; both exist because the two refusals read the
 * filesystem through different calls, and NEITHER may ever describe an entry by
 * anything but its own kind (never a link's target, which is working-tree text that
 * can itself carry PHI).
 */
function statsKind(s: Stats): string {
  if (s.isSymbolicLink()) return "a symbolic link";
  if (s.isFile()) return "a regular file";
  if (s.isFIFO()) return "a FIFO";
  if (s.isSocket()) return "a socket";
  if (s.isBlockDevice()) return "a block device";
  if (s.isCharacterDevice()) return "a character device";
  return "not a directory";
}

/**
 * Verify one DECLARED scan root and enumerate it, or REFUSE (exit 2).
 *
 * A ROOT IS A DECLARATION, NOT A DISCOVERY, and that is the whole distinction this
 * function exists to draw. `SCAN_ROOTS` is a promise about which of this repo's
 * bytes the gate has looked at; a subdirectory found inside one is a fact the
 * enumeration discovered for itself. So a declared root that is not there is a
 * BROKEN PROMISE and must refuse, while a subdirectory that vanishes mid-walk is
 * the transient class (`PHI-SCAN-ENUMERATE-THEN-READ-CLASS`) and stays tolerated in
 * `walk` below.
 *
 * MEASURED ON `5e2b42b`, moving `src/` (51 tracked files) out of the tree: all mode
 * printed `OK: no hits (71 file(s) scanned)` and exited 0, having opened no part of
 * the root it declares. THE DENOMINATOR DID NOT SAVE IT: 71 is an entirely
 * plausible number, so nothing looked wrong. A count is a weaker rule than it
 * appears -- it is a count of the roots that DID exist.
 *
 * THE DANGLING-LINK CASE IS THE SHARPEST, and it is why this check is `lstatSync`
 * and not `existsSync`: `existsSync` FOLLOWS a symbolic link and answers false for a
 * dangling one, so `walk` returned before `readdirSync` and the non-regular-entry
 * refusal (`PHI-SCAN-SYMLINK-BLIND-ON-BOTH-ROUTES`) never fired -- that rule only
 * ever classifies entries found INSIDE a root, and a root is not inside itself.
 * Measured identically: `OK: no hits (71 file(s) scanned)`, exit 0.
 *
 * A SYMBOLIC LINK IS REFUSED WHETHER OR NOT IT RESOLVES. At declaration time the
 * two are indistinguishable to the operator reading `SCAN_ROOTS`, and a resolving
 * one would have the walk read bytes the enumeration does not control and git does
 * not carry -- the same argument that refuses a link INSIDE a root.
 *
 * A non-directory root used to escape as an uncaught `ENOTDIR` from `readdirSync`
 * and exit **1**, which in this scanner's own contract means "hits found" rather
 * than "invocation error". THAT EXIT CODE IS DERIVED HERE, NOT PORTED: the same
 * shape exits 2 in `hl7` (its walk wraps `readdirSync`) and 1 in `terminology`.
 *
 * WHAT THIS RULE DOES NOT DO, AND THE BOUND IS NARROWER THAN IT READS: it certifies
 * that each declared root EXISTS AND IS ENUMERABLE. It does NOT certify that
 * anything was OBSERVED UNDER one, and it never will: an empty directory enumerates
 * perfectly. An EMPTIED root, or a root missing a whole subtree, satisfies every
 * check here. MEASURED ON `e039229` (this rule already in place): emptying `src/`
 * printed `OK: no hits (71 file(s) scanned)` exit 0 with 51 tracked files unopened,
 * and deleting `src/telecom/` alone printed `OK: no hits (105 file(s) scanned)` exit
 * 0 with 17 unopened. Re-measured identically in a local clone at `16c2fea`.
 *
 * THAT HALF IS NOW CLOSED, BUT NOT HERE, AND THE SPLIT IS THE POINT. It is a SEPARATE
 * RULE, downstream in `main`: reconcile the paths actually OBSERVED against
 * `gitTracked()` (see `unobservedTracked` / `refuseUnobserved`). It is NOT a race, NOT
 * the `existsSync` transient below, and it needs no content-addressed sweep. Do not
 * fold it back into this function to "simplify": a root check reads the filesystem,
 * and the whole reason the emptied case survived a root check is that the filesystem
 * is the thing that was emptied. The expected set has to come from the index instead.
 *
 * @param root - a repo-relative entry from `SCAN_ROOTS`.
 * @param out - collects absolute paths of scannable regular files.
 * @param unscannable - collects in-scope entries that are not regular files.
 * @param problems - collects a description of this root when it cannot be walked.
 */
function walkRoot(
  root: string,
  out: string[],
  unscannable: Unscannable[],
  problems: string[],
): void {
  const abs = join(REPO_ROOT, root);
  let st: Stats;
  try {
    // `lstatSync`, deliberately: it does NOT follow a link, so a dangling root and a
    // resolving one are both visible here as what they are.
    st = lstatSync(abs);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    problems.push(
      code === "ENOENT"
        ? `${root}/ does not exist`
        : `${root}/ could not be read (${code ?? "unknown error"})`,
    );
    return;
  }

  if (!st.isDirectory() || st.isSymbolicLink()) {
    // Names the root and a closed-set kind token. NEVER a link target: that is
    // working-tree text of the shape `../<dir>/<surname>-<given>-<dob>.txt`, so a
    // diagnostic about a PHI leak would become a PHI surface itself.
    problems.push(`${root}/ is ${statsKind(st)}, not a directory`);
    return;
  }

  walk(abs, out, unscannable);
}

/**
 * Refuse (exit 2) over declared roots the walk could not enumerate. EVERY offender is
 * named, not just the first, for the reason `refuseUnscannable` already states: a
 * developer who has to re-run the gate once per broken root learns to distrust it.
 */
function refuseRoots(problems: readonly string[]): void {
  if (problems.length === 0) return;
  const noun = problems.length === 1 ? "root" : "roots";
  throw new InvocationError(
    `refusing the scan: ${String(problems.length)} declared scan ${noun} could not be ` +
      `enumerated:\n${problems.map((p) => `  - ${p}`).join("\n")}\n` +
      `A scan root is a promise about which files this gate has looked at, so a root ` +
      `it cannot walk is a broken promise rather than an empty directory: the sweep ` +
      `would report OK over a corpus it never opened. Restore each as a real ` +
      `directory, or remove it from SCAN_ROOTS in scripts/phi-scan.ts.`,
  );
}

/**
 * Enumerate INSIDE a scan root, recursively. `Dirent`'s predicates are lstat answers
 * and are NOT exhaustive: an entry that is neither a directory nor a regular file is
 * collected into `unscannable` rather than falling out of the loop, so the caller can
 * refuse over it instead of reporting clean.
 *
 * ONLY ever called on a directory something already OBSERVED: `walkRoot` for a
 * declared root (which it verifies first, and refuses over), and this function for a
 * subdirectory `readdirSync` just reported. The `existsSync` guard below is therefore
 * NOT a root-existence check any more -- it is the directory-level face of the
 * tolerated transient (`PHI-SCAN-ENUMERATE-THEN-READ-CLASS`): a subdirectory removed
 * between its parent's `readdirSync` and the recursion into it. Do not re-purpose it
 * to cover a missing ROOT. It cannot: `existsSync` follows a symbolic link and answers
 * false for a dangling one, which is exactly how a whole declared root went unopened
 * under a clean report. See `walkRoot`.
 */
function walk(dir: string, out: string[], unscannable: Unscannable[]): void {
  if (!existsSync(dir)) return;
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    // Without this, an unreadable directory (`EACCES`) escaped as an uncaught throw
    // and exited **1**, which this scanner's contract reads as "hits found" rather
    // than "invocation error". A directory the sweep could not list is a scan that
    // did not happen, and it must say so in the code reserved for that.
    const code = (err as NodeJS.ErrnoException).code;
    // `ENOENT` here is the directory-level transient this function's comment
    // describes: the entry was listed by its parent and removed before the recursion
    // reached it. Tolerating it keeps that documented class true rather than turning
    // it into a refusal the prose does not predict.
    if (code === "ENOENT") return;
    throw new InvocationError(
      `could not list ${normalizePath(dir)} (${code ?? "unknown error"}). ` +
        `A directory the sweep cannot enumerate is not a clean directory.`,
    );
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out, unscannable);
    } else if (e.isFile()) {
      // TWO in-scope predicates, and this is the READ one, shared with staged mode.
      // `isUnderScanRoot` (the refusal boundary, in the `else` below and in
      // `buildTargetsForStaged`) is the other. They differ only by the `.md`
      // exemption, and that difference is the whole point: see the `else` branch.
      if (!isScannable(normalizePath(full))) continue;
      out.push(full);
    } else {
      // DELIBERATELY NOT filtered by `isScannable`. Everything the walk reaches is
      // already under a `SCAN_ROOTS` prefix, so the only clause that would bite here
      // is the `.md` exemption -- and that exemption is a judgement about a file
      // whose bytes the walk could have read. A link's NAME is no evidence at all
      // about what is on the other side of it, so `notes.md` as a symbolic link is
      // refused where `notes.md` as a regular file is skipped.
      unscannable.push({ path: normalizePath(full), kind: direntKind(e) });
    }
  }
}

/**
 * Refuse (exit 2) over entries the enumeration reached and cannot scan. EVERY
 * offender is named, not just the first: a developer who has to re-run the gate
 * once per link learns to distrust it.
 */
function refuseUnscannable(entries: readonly Unscannable[], why: string, remedy: string): void {
  if (entries.length === 0) return;
  const lines = entries.map((u) => `  - ${u.path} (${u.kind})`).join("\n");
  const noun =
    entries.length === 1 ? "entry is not a regular file" : "entries are not regular files";
  throw new InvocationError(
    `refusing the scan: ${String(entries.length)} ${noun}:\n${lines}\n${why} ${remedy}`,
  );
}

function gitIgnored(paths: string[]): Set<string> {
  const ignored = new Set<string>();
  if (paths.length === 0) return ignored;
  try {
    // SECURITY: array-form execFileSync, no shell. Default (Buffer) encoding:
    // `encoding: "buffer"` with `input` is rejected by Node.
    const out = execFileSync("git", ["check-ignore", "--stdin", "-z"], {
      input: paths.map(normalizePath).join("\0"),
      stdio: ["pipe", "pipe", "ignore"],
    });
    for (const p of out.toString("utf8").split("\0")) {
      if (p.length > 0) ignored.add(p);
    }
  } catch {
    // `git check-ignore` exits 1 when nothing matches: treat as none ignored.
  }
  return ignored;
}

/**
 * Every path git tracks, or `null` when git could not answer. `null` switches the
 * `tolerateVanish` tolerance off entirely (fail closed): without the tracked set
 * there is no way to tell a transient from committed content.
 *
 * An EMPTY answer counts as no answer, for the same reason. `git ls-files` exits 0
 * with no output for a repo whose index is empty or removed, and an empty set would
 * make EVERY file untracked, which is the one state in which the tracked-file bound
 * silently stops existing. (A CORRUPT index exits 128 and is already caught by the
 * `catch`.) This repo always tracks files, so there is no legitimate empty case.
 */
function gitTracked(): Set<string> | null {
  try {
    // SECURITY: array-form execFileSync, no shell. `-z` is NUL-separated and
    // unquoted, so it matches the walk's forward-slash relative paths exactly.
    const out = execFileSync("git", ["ls-files", "-z"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const tracked = new Set<string>();
    for (const p of out.toString("utf8").split("\0")) {
      if (p.length > 0) tracked.add(p);
    }
    return tracked.size > 0 ? tracked : null;
  } catch {
    return null;
  }
}

/**
 * The all-mode target set, AND the tracked set it must later be reconciled against.
 *
 * The tracked set is RETURNED rather than consumed here because it answers two
 * different questions at two different times: before the read it scopes the
 * vanish tolerance (`Target.tolerateVanish`), and after the read it is the only
 * independent statement of what the sweep was supposed to have opened
 * (`unobservedTracked`). One `git ls-files` answers both, so the two rules can
 * never disagree about what "tracked" meant on this run.
 */
function buildTargetsForAll(): { targets: Target[]; tracked: Set<string> | null } {
  const files: string[] = [];
  const unscannable: Unscannable[] = [];
  // EVERY declared root is verified, not merely visited. A root that is missing, is
  // a link (dangling or not), or is not a directory REFUSES here rather than being
  // silently skipped while the other roots supply a plausible denominator. Collected
  // first and refused together, so every broken root is named in one run.
  const rootProblems: string[] = [];
  for (const root of SCAN_ROOTS) walkRoot(root, files, unscannable, rootProblems);
  refuseRoots(rootProblems);

  // ONE `git check-ignore` over both lists. A gitignored entry is already out of
  // scope for the file route, so applying the same rule to a non-regular entry keeps
  // a single boundary rather than inventing a second, stricter one for links alone.
  const ignored = gitIgnored([...files.map(normalizePath), ...unscannable.map((u) => u.path)]);

  // Refuse BEFORE the read loop, on the `readdirSync` answer the walk already has.
  // No second `lstat` is taken, so this adds no new enumerate-then-read window of
  // its own (`PHI-SCAN-ENUMERATE-THEN-READ-CLASS`).
  refuseUnscannable(
    unscannable.filter((u) => !ignored.has(u.path)),
    "The walk can neither read such an entry nor vouch for what is on the other side of it.",
    "Remove it, replace it with a regular file, or (if it is genuinely not part of the " +
      "corpus) untrack it and add it to .gitignore.",
  );

  const tracked = gitTracked();
  const targets = files
    .filter((abs) => !ignored.has(normalizePath(abs)))
    .map((abs) => {
      const rel = normalizePath(abs);
      return {
        path: rel,
        read: () => readFileSync(abs),
        absPath: abs,
        tolerateVanish: tracked !== null && !tracked.has(rel),
      };
    });
  return { targets, tracked };
}

function buildTargetsForPaths(paths: string[]): Target[] {
  return paths.map((p) => {
    const abs = isAbsolute(p) ? p : resolve(REPO_ROOT, p);
    if (!existsSync(abs)) throw new InvocationError(`File not found: ${p}`);
    if (!statSync(abs).isFile()) throw new InvocationError(`Not a regular file: ${p}`);
    return { path: normalizePath(abs), read: () => readFileSync(abs) };
  });
}

/** git's file modes for a regular blob. Every other mode is not a file to read. */
const REGULAR_BLOB_MODES = new Set<string>(["100644", "100755"]);

/** Closed-set, engine-owned description of a git file mode. */
function gitModeKind(mode: string): string {
  if (mode === "120000") return "a symbolic link";
  if (mode === "160000") return "a gitlink (a nested repository)";
  if (mode === "000000") return "a git entry with no stage-0 blob";
  return `a git mode-${mode} entry`;
}

/**
 * The info half of a `--raw -z` record: `:<srcmode> <dstmode> <srcsha> <dstsha>
 * <status>`. The shas are ABBREVIATED by default (measured: 7 hex chars on git
 * 2.39.5), so the sha fields are matched as a run of hex rather than a fixed width.
 */
const RAW_RECORD = /^:(?:\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ [A-Z]\d*$/;

function buildTargetsForStaged(): Target[] {
  let listBuf: Buffer;
  try {
    // SECURITY: array-form execFileSync, no shell.
    //
    // Three flags, and each is load-bearing for a different reason.
    //
    // `--raw` rather than `--name-only`: the DESTINATION MODE is the only thing that
    // distinguishes a staged regular file from a staged symbolic link or gitlink, and
    // `git show :<path>` answers all three without complaint -- for a link it hands
    // back the TARGET PATH TEXT under mode `120000`, which this route used to scan and
    // report `OK` over. The mode is not available from `--name-only` at all.
    //
    // `--no-renames`: with rename detection on (the default since git 2.9) a fixture
    // that is `git mv`'d AND edited to add PHI stages as a single `R` entry. This
    // decomposes it into `D` + `A`, so the destination path, the one carrying the new
    // content, is enumerated. It also means `R`/`C` never reach the parser below, so
    // the two-field record stride holds. (The sibling scanner this narrowing was
    // ported from filters `R`/`C` out instead and therefore does not enumerate a
    // staged rename at all. That residual is NOT inherited here: `--no-renames` is a
    // decomposition, not an exclusion, and `catches PHI in a fixture that was RENAMED
    // and edited` pins it.)
    //
    // `--diff-filter=d` (lower-case: "everything EXCEPT deletions") rather than an
    // upper-case allow-list of status letters. `AM` was that allow-list, and it is the
    // wrong polarity for a safety gate: every letter it does not name is dropped
    // silently, which is how it missed `R` and `T` (typechange). An exclusion list
    // scans an unfamiliar letter instead of skipping it, so an unknown or future
    // status can only ever cost a wasted scan, never a missed one. Deletions are
    // excluded because there is no blob left to read.
    //
    // THE FILTER POLARITY IS WHAT MAKES THE MODE CHECK BELOW REACHABLE, and that was
    // MEASURED here rather than assumed: replacing a TRACKED regular file with a link
    // is neither an add nor a modify, so git 2.39.5 raises `:100644 120000 <sha>
    // <sha> T` -- present under `--diff-filter=d`, and an EMPTY raw output under
    // `--diff-filter=AM`. Do not narrow this back to an allow-list to "be explicit":
    // the mode check would go unreachable for every already-tracked path.
    listBuf = execFileSync(
      "git",
      ["diff", "--cached", "--no-renames", "--raw", "--diff-filter=d", "-z"],
      {
        encoding: "buffer",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (err) {
    throw new InvocationError(
      `git diff --cached failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // `--raw -z` emits `<info>\0<path>\0` per record. `R` (rename) and `C` (copy) are
  // the only statuses carrying a SECOND path, and `--no-renames` above means neither
  // is ever produced, so the stride is two fields. A record that does not parse
  // REFUSES rather than being skipped: a silently shortened list is exactly the shape
  // this scan must never report clean over, and if the stride ever desynced the next
  // record would fail to parse, which is the safe outcome.
  const fields = listBuf.toString("utf8").split("\0");
  const staged: { path: string; mode: string }[] = [];
  let i = 0;
  while (i < fields.length) {
    const info = fields[i];
    if (info === undefined || info.length === 0) {
      i += 1;
      continue;
    }
    const m = RAW_RECORD.exec(info);
    const mode = m?.[1];
    const path = fields[i + 1];
    if (mode === undefined || path === undefined || path.length === 0) {
      throw new InvocationError(
        "could not read the output of `git diff --cached --raw -z`: unrecognized record. " +
          "Refusing rather than scanning a list that may be short.",
      );
    }
    staged.push({ path, mode });
    i += 2;
  }

  // TWO PREDICATES, and the split is the same one the walk makes. `isUnderScanRoot`
  // governs the NON-REGULAR refusal, because the `.md` exemption inside `isScannable`
  // is a judgement about a file whose bytes could have been read and says nothing
  // about the other side of a link; `isScannable` governs what is actually READ.
  // Both stay WITHIN this route's existing path scope rather than widening it: a
  // gitlink at `test/nested` is refused, one at the repo root is not a path this
  // route looks at at all.
  //
  // Keeping these two the same predicate made the routes disagree about one entry:
  // MEASURED on a link named `test/fixtures/script/notes.md`, all mode refused
  // (exit 2) while `--staged` printed `OK: no hits (1 file(s) scanned)` and exited 0.
  refuseUnscannable(
    staged
      .filter((s) => isUnderScanRoot(s.path) && !REGULAR_BLOB_MODES.has(s.mode))
      .map((s) => ({ path: s.path, kind: gitModeKind(s.mode) })),
    "`git show :<path>` returns no scannable content for such an entry: for a symbolic link " +
      "it returns the TARGET PATH TEXT, which proves nothing about what is on the other side, " +
      "and the other kinds have no stage-0 blob to read at all.",
    "Unstage it, or replace it with a regular file.",
  );

  return staged
    .filter((s) => isScannable(s.path))
    .map(({ path: relPath }) => ({
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
    // A single Latin letter is a middle initial: not identifying. A single CJK
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
 * silently accepted: otherwise a real DOB in a non-year-first rendering
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
// SCRIPT (XML) scanner: element-stack walk, tag-scoped detection
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
      // (not a clean leaf): drop it and start fresh for this element.
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
  // The cross-cutting shape pass over the whole payload (free-text notes, etc.) is
  // NOT called here: `scanTarget` runs it once per target, because a target can now
  // earn BOTH structural scanners and would otherwise report each shape hit twice.
}

// ---------------------------------------------------------------------------
// Telecom (delimited) scanner: field-id keyed detection
// ---------------------------------------------------------------------------

function scanTelecom(target: Target, text: string, allow: AllowList, hits: Hit[]): void {
  // Tokenize on the union of the three NCPDP separators. Each resulting token is
  // a `<2-char field id><value>` pair; the leading fixed header (which carries no
  // separators, so it is one token) has no PHI field id and is ignored: patient
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
  // As in `scanScript`: the shape pass belongs to `scanTarget`, once per target.
}

// ---------------------------------------------------------------------------
// Format detection + dispatch
// ---------------------------------------------------------------------------

type Format = "script" | "telecom";

// A Telecom transmission is self-identifying in its bytes: it carries at least one
// of the three NCPDP control-char separators (FS/GS/RS). Well-formed XML cannot
// contain them (XML 1.0 production [2] `Char` excludes the C0 controls other than
// TAB/LF/CR), but a PHI gate exists for MALFORMED real-world bytes, so treat this
// as "very strong evidence", never "proof". That is why a payload carrying BOTH
// signals is scanned by BOTH scanners rather than routed to one: see
// `detectFormats`.
const TELECOM_SEPARATORS = /[\x1c\x1d\x1e]/;
// An element open/self-close/attribute-bearing tag. DELIBERATELY UNANCHORED: it is
// a "does this contain an element tree" test, ANDed below with a document-start
// check, never a whole-string match.
const XML_TAG_SHAPE = /<[A-Za-z][\w:.-]*[\s/>]/;

/**
 * Whether the WHOLE payload is an XML document: a leading `<` (after a BOM and
 * leading whitespace) plus an element tag somewhere. The document-start half is
 * what keeps a TypeScript source carrying `"<LastName>..."` in a string literal off
 * the structural scanner: see `detectFormats`'s note on the residual that leaves.
 */
function isXmlDocument(text: string): boolean {
  const t = text.replace(/^\uFEFF/, "").trimStart();
  return t.startsWith("<") && XML_TAG_SHAPE.test(t);
}

/**
 * Which structural scanners a target earns, from its CONTENT FIRST at every path,
 * with the extension as a fallback only for content that does not self-identify.
 *
 * This used to open with a path predicate (`test/` prefix, or a `.ncpdp` / `.xml`
 * extension) and return `"none"` for everything else, which made the file NAME,
 * not the bytes, decide whether a SCRIPT message was structurally read. Measured on
 * that base commit: one byte-identical SCRIPT document scored **2 hits as `.xml` and
 * exit 0 as `.ts`, `.txt`, `.dat` and `.json`** -- and **exit 0 as `.ncpdp`**, where
 * the extension short-circuit routed an XML document into the Telecom tokenizer,
 * which finds no field ids in it. Both directions were the same defect: an
 * extension outranking the bytes in front of it.
 *
 * The rule, and every clause of it is deliberate:
 *   1. NCPDP separators in the bytes -> Telecom.
 *   2. The payload is an XML document -> SCRIPT.
 *   3. **Rules 1 and 2 are not exclusive.** A payload that satisfies both earns
 *      BOTH scanners, in that order, because each content signal is very strong
 *      evidence and neither is proof. This is the answer to a precedence question,
 *      and it is deliberately NOT a precedence: ranking one signal over the other
 *      makes the loser's PHI unreadable, which is exactly the defect this returns a
 *      list to close. See "why a union, not a precedence" below.
 *   4. Only if NEITHER content signal fires, the extension, for a payload that says
 *      nothing about itself (an empty or truncated fixture, or a fragment):
 *      `.ncpdp` -> Telecom, `.xml` -> SCRIPT. **Matched case-insensitively**, like
 *      `isScannable`'s own `.md` test, so `.XML` and `.xml` are one name.
 *
 * The cross-cutting shape pass (`scanCommonShapes`) is NOT in this list. It runs on
 * every target exactly once, in `scanTarget`, whatever this returns -- including the
 * empty array. Keep it there: while each structural scanner called it itself, a
 * target earning two scanners would have reported every dashed SSN twice.
 *
 * WHY A UNION, NOT A PRECEDENCE. One stray `0x1C` inside a `<Note>` used to send a
 * whole well-formed SCRIPT document to the Telecom tokenizer, which finds no field
 * ids in XML: measured on `e1d9a34`, a complete prescription plus that one byte
 * scored **0 hits at every extension, `.xml` included**, where the identical document
 * without it scored 2 at every extension. Flipping the order would have moved the
 * hole rather than closed it (a Telecom transmission wrapped in an XML envelope
 * would lose its field-id scan instead), so neither signal outranks the other. The
 * union costs nothing in false positives that the base did not already pay: a target
 * is only ever handed a scanner its OWN content signalled, and residual (a) below is
 * what keeps that promise honest.
 *
 * KNOWN RESIDUALS. THIS IS NOT A CLOSED LIST -- this file's own header says the same
 * about the enumeration gaps, and publishing one as complete has been wrong twice
 * here. What survives:
 *
 *   a. A message EMBEDDED in a string literal (a SCRIPT fragment inside a `.ts`
 *      test or a JSDoc `@example`) is not structurally scanned, because the payload
 *      as a whole is not a document. It gets the conservative shape pass, so a
 *      dashed SSN or a non-test email in it is caught but a name or a DOB is not.
 *      This is the reason there is no path predicate rather than a wider one:
 *      sniffing XML out of arbitrary TypeScript is a separate job with its own
 *      false-positive surface, and a gate that cries wolf gets bypassed.
 *   b. Rule 4 still routes on a whole-suffix match, so a fragment fixture named
 *      `.xml.txt`, `.xml.bak` or `.ncpdp.orig` gets the shape pass only. The
 *      case fold does not touch that, and widening it is a separate decision.
 *   c. A Telecom payload with NO separator at all (a single field token) is only
 *      reached through rule 4, so one named neither `.ncpdp` nor `.xml` is invisible
 *      to the field-id scan. That is the arm rule 4 exists for, and it is why
 *      deleting it would be a trade rather than a simplification.
 *   d. Rule 4 is reached only when NEITHER content signal fires, so ONE content
 *      signal still suppresses the extension entirely. The stray-separator downgrade
 *      therefore survives ONE LEVEL DOWN, on a payload that is NOT a document:
 *      measured on both `e1d9a34` and this commit, a `.xml` FRAGMENT (leading prose)
 *      carrying `<LastName>` plus one `0x1C` scores **0 hits**, where the identical
 *      fragment without that byte scores 1. Rule 3 does not reach it, because rule 2
 *      never fires on a fragment. Unchanged by this commit rather than closed by it,
 *      and unioning rule 4 in as well is a further decision with its own
 *      false-positive weighing, not a tidy-up.
 *
 * Residuals (a) through (d) are executable rather than merely written down: see the
 * dispatch tests in `test/scripts/phi-scan.test.ts`.
 *
 * WHAT RULES 3 AND 4 CLOSE, STATED NO WIDER THAN IT WAS MEASURED. The two residuals
 * this function carried at `e1d9a34` are closed **wherever the two content tests
 * AGREE about a payload**, and each rule owns one of those two classes: rule 3 closes
 * the stray-separator downgrade where both tests claim it (a well-formed SCRIPT
 * DOCUMENT, the case the item named), and rule 4's case fold closes the `.XML` /
 * `.NCPDP` spelling gap where both decline it, which is the whole class rule 4
 * governs. What is open is where they DISAGREE: residual (d), a fragment one test
 * claims and the other cannot. Each closure has a pinning test; so does (d).
 */
function detectFormats(text: string, path: string): readonly Format[] {
  const t = text.replace(/^\uFEFF/, "");
  const byContent: Format[] = [];
  if (TELECOM_SEPARATORS.test(t)) byContent.push("telecom");
  if (isXmlDocument(t)) byContent.push("script");
  // ONE content signal is enough to suppress the fallback, which is what leaves
  // residual (d) above: a fragment the separator test claims but the document test
  // cannot. Left as it was at `e1d9a34` rather than widened here.
  if (byContent.length > 0) return byContent;
  // Fallback ONLY for a payload that said nothing about itself. Load-bearing: it is
  // what keeps a `.xml` FRAGMENT fixture (leading prose, so not a document) and a
  // separator-less `.ncpdp` field token structurally scanned. Do not delete it to
  // simplify the case fold.
  const lower = path.toLowerCase();
  if (lower.endsWith(".ncpdp")) return ["telecom"];
  if (lower.endsWith(".xml")) return ["script"];
  return [];
}

/**
 * Scan one target.
 *
 * @returns `true` when the target's bytes were OBSERVED (whatever the dispatch then
 * did with them, including deciding they are out of structural scope), and `false`
 * only for the one tolerated TOCTOU case on `Target.tolerateVanish`. The caller
 * counts the `true`s: that count is the printed denominator and the input to the
 * observed-nothing refusal, so a tolerated file can never inflate either.
 */
function scanTarget(target: Target, allow: AllowList, hits: Hit[]): boolean {
  let buf: Buffer;
  try {
    buf = target.read();
  } catch (err) {
    // TOCTOU, see `Target.tolerateVanish`: an untracked file the walk enumerated
    // itself may be a transient that was deleted before we reached it. Report it as
    // unobserved instead of refusing; every other failure, and any tracked file,
    // still refuses the whole scan.
    if (target.tolerateVanish === true && errorCode(err) === "ENOENT") return false;
    throw new InvocationError(
      `could not read ${target.path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const text = buf.toString("utf8");
  for (const fmt of detectFormats(text, target.path)) {
    if (fmt === "script") scanScript(target, text, allow, hits);
    else scanTelecom(target, text, allow, hits);
  }
  // Cross-cutting shape checks (dashed SSNs, non-test emails) over the whole payload,
  // ONCE, whatever the structural dispatch found -- including nothing, which is the
  // conservative pass a non-NCPDP target (hand-written `src/`, plain-text notes) gets.
  scanCommonShapes(target.path, text, allow, hits);
  return true;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(hits: Hit[], scanned: number): void {
  // The denominator rides on every line: an `OK` is only meaningful next to the
  // number of files it is an `OK` over.
  const denom = `${String(scanned)} file(s) scanned`;
  if (hits.length === 0) {
    process.stdout.write(`[phi-scan] OK: no hits (${denom})\n`);
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
    `[phi-scan] ${String(hits.length)} hit(s) across ${String(byPath.size)} file(s) (${denom}). ` +
      `If a value is genuinely synthetic, declare it in scripts/phi-allow-list.txt OR ` +
      `run with --allow-fixture <path> AND log it in phi-scan-overrides.md.\n`,
  );
}

// ---------------------------------------------------------------------------
// The observation invariant
// ---------------------------------------------------------------------------

/**
 * Refuse any invocation that would scan nothing, or whose overrides subtract
 * nothing. This is the rule that keeps `OK: no hits` honest: without it, an
 * emptied target set is indistinguishable from a clean corpus, and the gate
 * reports success for a scan it never performed.
 *
 * @param mode - the resolved scan mode.
 * @param enumerated - targets BEFORE `--allow-fixture` subtraction.
 * @param allowed - normalized `--allow-fixture` paths.
 * @returns the surviving targets.
 * @throws InvocationError when the scan would observe nothing, or an override is inert.
 */
function enforceObservation(
  mode: Args["mode"],
  enumerated: Target[],
  allowed: ReadonlySet<string>,
): Target[] {
  const enumeratedPaths = new Set(enumerated.map((t) => t.path));

  // An override that subtracts nothing is inert: it reads as a live bypass in the
  // log while doing nothing, which is how a stale override log drifts unnoticed.
  const inert = [...allowed].filter((p) => !enumeratedPaths.has(p));
  if (inert.length > 0) {
    throw new InvocationError(
      `--allow-fixture matched no scanned file:\n${inert.map((p) => `  - ${p}`).join("\n")}\n` +
        `An override only ever SUBTRACTS a file the scan already covers. Check the path, ` +
        `and remove the entry from phi-scan-overrides.md if the file is gone.`,
    );
  }

  // "Nothing staged" is the one legitimate empty scan (a commit that touches no
  // in-scope file). Every other empty enumeration means the roots went missing.
  if (enumerated.length === 0) {
    if (mode === "staged") return [];
    throw new InvocationError(
      `no files to scan under ${SCAN_ROOTS.join(", ")}. A scan of nothing is not a pass; ` +
        `check the roots in scripts/phi-scan.ts.`,
    );
  }

  const survivors = enumerated.filter((t) => !allowed.has(t.path));
  if (survivors.length === 0) {
    throw new InvocationError(
      `every one of the ${String(enumerated.length)} file(s) in scope was excluded by ` +
        `--allow-fixture: the scan would observe nothing and report OK. Narrow the ` +
        `overrides, or declare the values in scripts/phi-allow-list.txt instead.`,
    );
  }
  return survivors;
}

/**
 * Every TRACKED, in-scope path the all-mode sweep did not actually OPEN.
 *
 * EXISTENCE IS NOT OBSERVATION, and that gap is the whole reason this function is
 * separate from `walkRoot`. The root check certifies that each declared root is
 * present and enumerable; it cannot certify that anything was found under one. An
 * EMPTIED root satisfies it completely, and so does a root missing a whole subtree,
 * because a directory with nothing in it enumerates perfectly.
 *
 * MEASURED in a local clone of this repo at `16c2fea`, with the root check already
 * in place: emptying `src/` printed `OK: no hits (71 file(s) scanned)` and exited 0
 * with all 51 tracked files under it unopened, and deleting `src/telecom/` alone
 * printed `OK: no hits (105 file(s) scanned)` and exited 0 with 17 unopened. The
 * healthy control on the same clone was `122 file(s) scanned`.
 *
 * A DENOMINATOR CANNOT DETECT EITHER OF THOSE, and this repo's own refuter refuted
 * the suggestion that it could: 71 against a healthy 122 is a number nothing about
 * the report makes look wrong, because a count counts the files that WERE found. The
 * fix therefore cannot be a bigger or better number. It has to be a comparison
 * against a statement of the corpus that does NOT come from the walk, which is what
 * `git ls-files` is: the walk reads directory entries, git reads the index, and a
 * directory emptied on disk changes only the first. A rule that recomputed the
 * expected set from the walk would agree with the walk forever.
 *
 * SCOPE, deliberately narrow:
 *   - `isScannable`, not `isUnderScanRoot`: a tracked `.md` is exempt from the READ,
 *     so demanding it be observed would refuse every healthy run. This is the one
 *     place the READ predicate is the right one, because the question being asked is
 *     literally "was this file read?";
 *   - an `--allow-fixture` path is already a reviewed, logged subtraction, so it is
 *     accounted for rather than unobserved. `enforceObservation` separately refuses
 *     an override that subtracts nothing and one that empties the set, so this
 *     exemption cannot be used to hide a corpus;
 *   - an UNTRACKED file is never expected. The tolerated-vanish class is untracked by
 *     construction, so tolerating one can never trip this rule, and the two rules stay
 *     independent instead of one quietly re-deciding the other.
 *
 * A TRACKED ENTRY THAT IS NOT A REGULAR FILE never reaches here: a symbolic link
 * under a scan root is refused by `refuseUnscannable` before any read. A tracked
 * gitlink (a nested repository) does reach here and IS reported, which is correct
 * and matches what `--staged` already does with mode `160000`: its bytes are not in
 * this repo and the sweep cannot account for them.
 *
 * @param tracked - `git ls-files`, the independent statement of the corpus.
 * @param observed - paths whose bytes `scanTarget` actually read.
 * @param allowed - normalized `--allow-fixture` paths.
 * @returns the unobserved paths, sorted, or an empty array when the sweep is whole.
 */
function unobservedTracked(
  tracked: ReadonlySet<string>,
  observed: ReadonlySet<string>,
  allowed: ReadonlySet<string>,
): string[] {
  const missing: string[] = [];
  for (const rel of tracked) {
    if (!isScannable(rel)) continue;
    if (allowed.has(rel)) continue;
    if (observed.has(rel)) continue;
    missing.push(rel);
  }
  return missing.sort();
}

/**
 * Refuse (exit 2) an all-mode sweep that did not open every tracked in-scope file.
 *
 * EVERY unobserved path is named, not a sample of them, for the reason
 * `refuseUnscannable` and `refuseRoots` both already state: a developer who has to
 * re-run the gate to see the rest of the list learns to distrust it. The list is
 * bounded by the corpus rather than by `SCAN_ROOTS`, so it can be long; that is the
 * honest shape of the failure and truncating it would put the reader back where the
 * denominator left them. These are committed path names, the same locus every hit
 * already carries, and NOTHING here is derived from any file's contents.
 */
function refuseUnobserved(missing: readonly string[]): void {
  if (missing.length === 0) return;
  const noun = missing.length === 1 ? "file" : "files";
  throw new InvocationError(
    `refusing the scan: ${String(missing.length)} tracked in-scope ${noun} ` +
      `${missing.length === 1 ? "was" : "were"} never opened by the sweep:\n` +
      `${missing.map((p) => `  - ${p}`).join("\n")}\n` +
      `A declared scan root that EXISTS is not a root that was OBSERVED: an emptied ` +
      `root, or one missing a subtree, enumerates perfectly and the remaining roots go ` +
      `on supplying a plausible denominator, so the report reads exactly like a real ` +
      `pass. Restore the working tree, or, if these files are genuinely no longer part ` +
      `of the corpus, remove them from the index. NOTE: do not expect git status to ` +
      `show them. A sparse checkout and a skip-worktree bit both leave it CLEAN while ` +
      `the file is absent from disk (measured both), which is precisely why this rule ` +
      `reads the index rather than the status.`,
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

  const allowed = new Set<string>(args.allowFixtures.map(normalizePath));

  let allow: AllowList;
  let targets: Target[];
  // Only all mode has a corpus to reconcile against: `staged` is bounded by the
  // index diff and `paths` by the caller's argv, and neither claims to have covered
  // the tree. Left `null` for those two so the claim is impossible to make there.
  let tracked: Set<string> | null = null;
  try {
    // Inside the try: a missing allow-list is an invocation error (2), and used to
    // escape as an uncaught throw that exited 1, which reads as "hits found".
    allow = loadAllowList();
    if (args.mode === "staged") targets = buildTargetsForStaged();
    else if (args.mode === "paths") targets = buildTargetsForPaths(args.paths);
    else ({ targets, tracked } = buildTargetsForAll());
    targets = enforceObservation(args.mode, targets, allowed);
  } catch (err) {
    if (err instanceof InvocationError) {
      process.stderr.write(`[phi-scan] ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  const hits: Hit[] = [];
  const vanished: Target[] = [];
  // The PATHS observed, not merely how many. The count is the printed denominator;
  // the set is what the tracked corpus is reconciled against, and the whole lesson of
  // this rule is that the two are not the same evidence.
  const observedPaths = new Set<string>();
  let observed = 0;
  for (const t of targets) {
    try {
      if (scanTarget(t, allow, hits)) {
        observed += 1;
        observedPaths.add(t.path);
      } else vanished.push(t);
    } catch (err) {
      if (err instanceof InvocationError) {
        process.stderr.write(`[phi-scan] ${err.message}\n`);
        return 2;
      }
      throw err;
    }
  }

  // A tolerated file is never silent, and the tolerance is only good while the file
  // is still gone: if it is back on disk the sweep skipped something that exists,
  // which is an incomplete scan and refuses like any other.
  if (vanished.length > 0) {
    const back = vanished.filter((t) => t.absPath !== undefined && existsSync(t.absPath));
    if (back.length > 0) {
      process.stderr.write(
        `[phi-scan] could not read ${back.map((t) => t.path).join(", ")}: vanished mid-scan and ` +
          `is present again, so the sweep did not observe it. Re-run with the tree at rest.\n`,
      );
      return 2;
    }
    process.stderr.write(
      // "gone" rather than "deleted": a rename leaves the enumerated path just as
      // absent, and the residual on `Target.tolerateVanish` is about exactly that
      // case, so the line must not assert the file was removed.
      `[phi-scan] skipped ${String(vanished.length)} untracked file(s) gone between ` +
        `enumeration and read: ${vanished.map((t) => t.path).join(", ")}\n`,
    );
  }

  // Refuse a sweep that observed nothing. `enforceObservation` already refuses an
  // empty TARGET set; this is its read-side twin, so tolerating a vanished file can
  // never decay into a clean report of a tree nothing was read from. (`staged`
  // legitimately has nothing to scan when a commit touches only markdown, and
  // `paths` is bounded by the caller's argv.)
  if (args.mode === "all" && observed === 0) {
    process.stderr.write(
      "[phi-scan] refusing: the all-mode sweep observed no files, so it proves nothing.\n",
    );
    return 2;
  }

  // RECONCILE WHAT WAS OBSERVED AGAINST WHAT GIT TRACKS. Everything above this line
  // constrains the target set or the reads; none of it can witness a file that was
  // never enumerated in the first place, which is what an emptied root produces. This
  // is the only check in the file whose expected set comes from outside the walk.
  //
  // Refuses BEFORE `report`, and deliberately without printing hits first: the same
  // choice the vanished-and-back-on-disk branch above makes. Exit 2 does not mean
  // "clean" or "dirty", it means the run is not evidence of either, and printing a
  // partial hit list underneath that invites it to be read as the finding. Restore
  // the tree and re-run; the hits (if any) are still there.
  if (args.mode === "all") {
    if (tracked === null) {
      // Fail closed, the same way `gitTracked` already fails closed for the vanish
      // tolerance and for the identical reason: with no tracked set there is no
      // independent statement of the corpus, so the sweep cannot show it covered one.
      // Leaving it un-reconciled instead would mean an unanswerable git silently
      // switches this rule off and restores the exact false green it exists to close.
      process.stderr.write(
        "[phi-scan] refusing: git could not say which files are tracked, so the sweep " +
          "cannot show it opened the committed corpus. An `OK` here would be a claim " +
          "about a corpus nothing stated. Run the scan inside a git work tree with a " +
          "populated index.\n",
      );
      return 2;
    }
    try {
      refuseUnobserved(unobservedTracked(tracked, observedPaths, allowed));
    } catch (err) {
      if (err instanceof InvocationError) {
        process.stderr.write(`[phi-scan] ${err.message}\n`);
        return 2;
      }
      throw err;
    }
  }

  // The denominator is what was OBSERVED, not what was enumerated: a file the sweep
  // was allowed to skip must not be counted in the number an `OK` is read against.
  report(hits, observed);
  return hits.length === 0 ? 0 : 1;
}

process.exit(main());
