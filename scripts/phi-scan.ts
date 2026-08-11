#!/usr/bin/env tsx
/**
 * `@cosyte/ncpdp` PHI scanner: the CI / pre-commit half of the PHI commit-gate.
 *
 * ===========================================================================
 * WHAT IS IN THIS FILE, AND WHAT IS NOT.
 *
 * The MACHINERY is `@cosyte/script-utils/phi-scan`, a devDependency: argument
 * parsing, the allow-list and the override log, target enumeration on all three
 * routes, the union of the working-tree walk with the bytes git carries, content
 * deduplication, THE COMPLETENESS RULE, every refusal, and the cross-cutting
 * SSN/email FLOOR. Read that module's docblock for what each rule closes and what
 * it costs; nothing is restated here, because a claim written down twice is a
 * claim that drifts. The narrative for how this repo earned each of those rules
 * stays in `documentation/agent-notes.md`.
 *
 * IT IS A DEPENDENCY AND NOT A COPY, AND THAT IS THE POINT. This file used to
 * carry the whole engine, hand-ported, and so did twelve siblings. A newly-found
 * escape therefore cost one pull request and one adversarial review PER REPO, and
 * three escape classes have been paid for that way already. Now it costs one pull
 * request in `cosyte/config` and a version bump here.
 *
 * IT IS A devDependency, NEVER A RUNTIME ONE. The zero-dep rule governs what
 * ships; a dev-time gate does not ship.
 *
 * WHAT STAYS LOCAL is what genuinely differs: THE FIVE PER-REPO AXES below, and
 * the NCPDP-SPECIFIC FIELD DETECTION in `detect` at the bottom of this file.
 * ===========================================================================
 *
 * ===========================================================================
 * THIS SCANNER IS ARMED FOR BOTH NCPDP WIRE FORMATS. It is not the starter shape
 * the parser template ships: the engine's floor (a dashed SSN, an email at an
 * undeclared domain) is the FLOOR, and on top of it this file carries structured,
 * field-level detection for both standards.
 *
 * NCPDP is TWO structurally unrelated wire formats under one brand, and this file
 * scans both:
 *   SCRIPT   XML ePrescribing. A dependency-free element-stack walk, tag-scoped,
 *            namespace-prefix stripped, matched case-insensitively. Deliberately
 *            independent of the package's own `fast-xml-parser` so that a shared
 *            parse bug cannot blind the safety gate.
 *   Telecom  Control-character-framed fixed fields. Keyed off the self-identifying
 *            2-character field ids, which are globally unique in the standard, so
 *            a corrupt or missing Segment Identification cannot route a value away
 *            from its detector.
 *
 * WHICH SCANNER A TARGET GETS IS DECIDED BY ITS BYTES, NOT ITS NAME, and a payload
 * signalling both gets BOTH (a union, never a precedence). The case-folded
 * extension is a fallback only, for a payload that says nothing about itself; that
 * arm is load-bearing and pinned against deletion. See `detectFormats`.
 *
 * A DOB FIELD FAILS CLOSED: a value in a DOB-scoped field that the normalizer
 * cannot parse but that still carries a date signal is a hit, not a silent accept.
 *
 * NCPDP redistribution note: this file encodes only wire-format field ids and tag
 * names, never NCPDP-copyrighted prose.
 * ===========================================================================
 *
 * ===========================================================================
 * EXIT CONTRACT, DERIVED HERE AND NEVER PORTED:
 *
 *   0  the scan ran, READ EVERY TARGET IT ENUMERATED, and found nothing.
 *   1  HITS. Reserved for "this corpus contains something that looks like PHI".
 *      It is NOT exclusive: an allow-list, or an override log, that EXISTS but
 *      cannot be READ throws a plain `Error` and takes node's own exit 1, which a
 *      caller reads as "hits found". The engine names that escape rather than
 *      claiming to have closed it.
 *   2  EVERY STATE THE ENGINE RAISES IN WHICH THE SCAN CANNOT ACCOUNT FOR
 *      SOMETHING. The full list is in the engine's `run()` docblock.
 *
 * 1 IS RESERVED BECAUSE CI AND THE PRE-COMMIT HOOK BRANCH ON THE CODE. A caller
 * must be able to tell "PHI was found here" from "this scan is not trustworthy".
 *
 * DO NOT PORT THESE NUMBERS INTO, OR OUT OF, A SIBLING PARSER. The `@cosyte/*`
 * scanners do not agree on them and are not required to. That is why the engine
 * has no default for them.
 * ===========================================================================
 *
 * ===========================================================================
 * THIS FILE IS NOT FINISHED AND MUST NOT BE MERGED YET.
 *
 * It is the DERIVATION of this repo's parameters against the engine as published
 * at `@cosyte/script-utils@0.0.2`, and seven things this repo does are not
 * expressible through that engine's configuration surface. The standing rule is
 * that ALL process lives in the shared engine and is PARAMETERIZED, and that a
 * repo-local workaround is exactly what this adoption exists to delete, so each
 * one below is written down as an ENGINE REQUIREMENT rather than absorbed here.
 *
 * Every entry names what was MEASURED on this branch, at `@cosyte/script-utils`
 * `0.0.2`, against this repo's own suite and corpus.
 *
 *  (1) `DetectContext` CARRIES NO UNDECORATED TARGET PATH. It carries the reported
 *      LOCUS, and the locus of a target read out of the git index carries an origin
 *      label, so it ends in `)`. `detectFormats`'s rule 4 reads the case-folded
 *      EXTENSION and is pinned against deletion, so rule 4 is DEAD on the index
 *      half of the union. Wanted: `targetPath: string` on `DetectContext`, additive,
 *      no default needed because the engine already has it at the call site. A
 *      caller-side transform will NOT do: recovering the bare path means parsing
 *      engine-owned text, which narrows silently the moment that text changes.
 *
 *  (2) THE ALLOW-LIST VOCABULARY IS FIXED AT FOUR TAGS AND CANNOT BE EXTENDED.
 *      `AllowList` carries `names`, `dobs`, `ids` and `emailDomains`, and the
 *      parser drops an unrecognised tag SILENTLY, so this repo's documented `ADDR`
 *      tag reaches nothing at all. The template names five detector kinds (names,
 *      DOB, member id, ADDRESS, PHONE) and the engine ships declaration sets for
 *      three of them. Wanted: a declared tag namespace (tag name, case folding,
 *      resulting set) defaulting to today's four. Until then `checkAddress` below
 *      consults `ids`, which moves no verdict here because this repo declares zero
 *      synthetic street addresses, and the allow-list header states the tag to use.
 *
 *  (3) NCPDP'S IDENTIFIER VOCABULARY DOES NOT FIT ONE `ids` SET. This repo
 *      distinguishes patient id from cardholder / member id on the Telecom side and
 *      seven identifier tags on the SCRIPT side (see the tables below), and the
 *      DETECTION is the same shape test for all of them. What does not survive the
 *      collapse is the DECLARATION: one undifferentiated pool means declaring a
 *      synthetic value in one role declares it in every role. That is the same
 *      requirement as (2) rather than a new one, and it is stated separately so it
 *      is not read as a request to widen what a detector kind MEANS.
 *
 *  (4) A SCAN ROOT IS A DECLARATION HERE, AND THE ENGINE TREATS IT AS A DISCOVERY.
 *      MEASURED: with `src/` removed entirely the engine prints `OK: no hits` at
 *      exit 0, where this repo's scanner refused at exit 2 naming the root; the
 *      same holds for a root replaced by a regular file. The index union covers the
 *      TRACKED half of that, which is why the run is not a false green about the
 *      committed corpus, but a mistyped root, a root outside a git tree, and a root
 *      whose subtree is untracked are all indistinguishable from a correct one.
 *      Wanted: a parameter, because the siblings genuinely disagree on the code a
 *      file root gets.
 *
 *  (5) THE UNREADABLE ALLOW-LIST / OVERRIDE LOG ESCAPE IS A REGRESSION HERE, NOT A
 *      RESIDUAL. The engine discloses that a file which EXISTS but cannot be READ
 *      throws a plain `Error` and takes node's exit 1. This repo CLOSED both, with
 *      committed tests, because 1 is this contract's HITS code. MEASURED on this
 *      branch: an unreadable allow-list now exits 1 where it exited 2. This is not
 *      a per-repo axis and wants no parameter: the engine should raise its own
 *      refusal for both reads.
 *
 *  (6) THE CLEAN REPORT LINE CARRIES NO DENOMINATORS. The engine prints
 *      `OK: no hits`. This repo's rule is that no `OK` is printed without the
 *      numbers it is an `OK` over, and its suite parses them. The count is NOT the
 *      rule (a denominator cannot witness an emptied root, which is why the
 *      reconciliation exists), but it is the human-facing sanity number.
 *
 *  (7) THE OVERRIDE LOG'S ENTRY SECTION IS NOT SCOPED. This repo honours a
 *      `### <path>` heading only UNDER `## Entries`, so a `###` in the prose above
 *      cannot become an allow entry; the engine honours any `###` anywhere.
 *      MEASURED: this repo's committed log holds five `###` headings, ALL above
 *      `## Entries`, and zero real entries, so under the engine all five become
 *      honoured bypass paths. It is the lowest-severity item because a bypass is
 *      recorded and then REFUSED in every mode, so both readings still exit 2; what
 *      changes is which tier refuses.
 *
 * AND ONE ACCEPTED LOSS, STATED BECAUSE IT IS PINNED BY COMMITTED TESTS RATHER THAN
 * BECAUSE IT IS IN DOUBT: `Target.tolerateVanish` is gone. An untracked file that
 * vanishes between enumeration and read was reported unobserved and subtracted from
 * the denominator; the engine REFUSES instead. That is stricter, and stricter is the
 * right direction for this gate, but it is live rather than hypothetical here: this
 * repo's own suite writes violator files under `test/` and `scripts/` and removes
 * them again.
 * ===========================================================================
 */

import {
  exemptsMarkdown,
  runPhiScan,
  type AllowList,
  type DetectContext,
} from "@cosyte/script-utils/phi-scan";

// ===========================================================================
// THE FIVE PER-REPO AXES
// ===========================================================================
//
// A PORT IS NOT A COPY. Five things genuinely differ between the sibling
// `@cosyte/*` scanners, and every one of them is a PARAMETER of the shared engine
// rather than a fork of it. Re-derived HERE, against this repo:
//
//   1. EXIT CODES        `EXIT_CODES`. No default exists, deliberately.
//   2. ROOTS+EXCLUSIONS  `SCAN_ROOTS`, plus the READ filter. This repo declares NO
//                        excluded paths, so `excludedPaths` is left at the
//                        engine's empty default: its own scanner test carries
//                        violator-shaped values assembled from parts at runtime
//                        rather than written down, so there is nothing to exclude.
//   3. `--staged` SCOPE  `isStagedReadable`.
//   4. GITLINKS          `regularBlobModes`, defaulted by the engine to git's two
//                        regular-blob modes, which is what this repo used.
//   5. EOL NORMALIZATION No parameter: the engine's walk/index deduplication is BY
//                        CONTENT, so a repo whose index carries LF and whose
//                        working tree carries CRLF scans BOTH forms. CHECKED here
//                        rather than skipped: this repo has no `.gitattributes`
//                        and no `core.autocrlf`, so the two copies do not diverge
//                        today, and the union costs one `ls-files -s`.
// ===========================================================================

/** AXIS 1: this repo's exit contract, stated in the header block above. */
const EXIT_CODES = { clean: 0, hits: 1, refuse: 2 } as const;

/**
 * AXIS 2: the roots `all` mode walks, as repo-relative prefixes.
 *
 * `test/` is walked WHOLE. It used to stop at `test/fixtures/`, which meant every
 * test outside `fixtures/` was invisible to the gate even though this repo builds
 * Telecom and SCRIPT messages as inline string literals in exactly those files.
 * `scripts/` is walked for the same reason: it is tracked, hand-written text that
 * can carry a real address or email as easily as a fixture can.
 *
 * NONE OF THESE IS `./`-PREFIXED, AND THAT IS LOAD-BEARING RATHER THAN A STYLE
 * CHOICE. The engine normalises a root the way it normalises every other path, so
 * `src` and `./src` are one root today; before that fix a `./`-prefixed root
 * walked correctly while matching no index path, which silently emptied the index
 * union and both index refusals. Measured on this repo: `src`, `test` and
 * `scripts` match 51, 65 and 9 tracked paths respectively.
 *
 * NARROWING THIS IS A SCOPE DECISION. Re-derived on adoption rather than carried
 * over: 44 tracked files sit outside these three roots, and scanning all 44 buys
 * ONE non-PHI hit (a company contact address in `package.json`). That trade has
 * not changed, so the roots have not.
 */
const SCAN_ROOTS: readonly string[] = ["src", "test", "scripts"];

/**
 * Whether a repo-relative path sits under a scan root at all.
 *
 * IT IS NOT THE READ FILTER, AND COLLAPSING THE TWO MADE THE ROUTES DISAGREE. The
 * `.md` exemption is a judgement about a file whose BYTES the scan could have
 * read; a link's NAME is no evidence at all about what is on the other side of it.
 * The engine keys its non-regular refusals on the root half of scope for exactly
 * that reason, so this predicate is what `isStagedReadable` must stay inside.
 */
function isUnderScanRoot(rel: string): boolean {
  return SCAN_ROOTS.some((root) => rel === root || rel.startsWith(`${root}/`));
}

/**
 * AXIS 3: the READ half of scope for `--staged`, i.e. which regular blobs a COMMIT
 * is blocked on.
 *
 * BOTH HALVES ARE REQUIRED AND THE ROOT HALF IS THE ONE THAT IS EASY TO DROP. The
 * engine REFUSES a staged path this admits that no scan root covers, rather than
 * silently narrowing to the intersection, because that state is a misconfiguration
 * in the one place the gate is a commit blocker. A reviewer measured what leaving
 * it to `exemptsMarkdown` alone costs: a staged mode-120000 entry outside every
 * scan root was enumerated, read, had the LINK'S TARGET PATH handed to the
 * detector as if it were content, and reported `OK: no hits` at exit 0.
 *
 * This mirrors the sweep's read filter (`exemptsMarkdown`, the engine's default
 * `isWalkReadable`) intersected with the root half, which is the same pairing the
 * hand-written scanner used before adoption.
 */
function isStagedReadable(relPath: string): boolean {
  return exemptsMarkdown(relPath) && isUnderScanRoot(relPath);
}

// ===========================================================================
// THE NCPDP-SPECIFIC FIELD TABLES
// ===========================================================================

type TelecomCategory = "name" | "dob" | "address" | "phone" | "id" | "memberid";

// Telecom 2-character field ids that carry patient / cardholder PHI, keyed to the
// PHI category the value must be checked against. These ids are globally unique in
// the NCPDP Telecommunication standard, so keying off the field id (rather than the
// enclosing segment) is both correct AND bypass-resistant: a corrupt or missing
// Segment Identification (`AM`) field cannot route a value away from its detector.
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

// NCPDP Telecommunication Standard separators (control characters): Field
// Separator (FS, 0x1C), Group Separator (GS, 0x1D), Segment Separator (RS, 0x1E).
// Tokenization splits on the union of the three; see `scanTelecom`.
const TELECOM_SEPARATORS = /[\x1c\x1d\x1e]/;

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

// Name-noise tokens (degrees / suffixes / prefixes): extracted alongside real name
// tokens and skipped. Never a person's identifying name.
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

// ===========================================================================
// The per-field checks
// ===========================================================================

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
 * Whether a value carries a date signal (a 4-digit year run, at least 6 digits
 * total, or a month-name token). Used to fail CLOSED in a DOB-scoped field: a value
 * the normalizer cannot parse but that still looks date-ish must be flagged, not
 * silently accepted, or a real DOB in a non-year-first rendering slips through.
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

type Raise = DetectContext["hit"];

function checkName(hit: Raise, loc: string, value: string, allow: AllowList): void {
  for (const tok of nameTokens(value)) {
    if (!isNameToken(tok)) continue;
    if (!allow.names.has(tok.toUpperCase())) {
      hit({
        segment: loc,
        value: tok,
        reason: "person-name token not in synthetic allow-list",
      });
    }
  }
}

function checkDob(hit: Raise, loc: string, value: string, allow: AllowList): void {
  // `checkDob` is only ever called on a location whose context already establishes
  // the value IS a date of birth (SCRIPT `<DateOfBirth>`, Telecom 304-C4), so it
  // must fail CLOSED: a value we cannot normalize but that still looks date-ish is
  // a hit, not a silent accept.
  const dob = normalizeDob(value);
  if (dob === null) {
    if (hasDateSignal(value)) {
      hit({
        segment: loc,
        value,
        reason:
          "unrecognized date-of-birth shape in a DOB field (normalize to CCYYMMDD if synthetic)",
      });
    }
    return;
  }
  if (!allow.dobs.has(dob)) {
    hit({ segment: loc, value: dob, reason: "date of birth not in synthetic allow-list" });
  }
}

/**
 * A street-address line.
 *
 * IT CONSULTS `allow.ids`, WHICH IS A CHANGE OF DECLARATION SET AND NOT OF
 * DETECTION. The shared `AllowList` carries `names`, `dobs`, `ids` and
 * `emailDomains` and has NO address set, so the `ADDR` tag this repo's allow-list
 * used to document reaches nothing: the engine's parser drops an unrecognised tag
 * silently. A detector that consults nothing has NO REMEDY at all, because the
 * whole-file `--allow-fixture` bypass cannot reach a clean run in any mode, so the
 * remedy is re-pointed at the identifier set rather than dropped. The allow-list's
 * own header states the tag to use.
 *
 * NO VERDICT MOVES TODAY: this repo declares zero synthetic street addresses, so
 * both sets are empty of them. The proper fix is an `addresses` set in the shared
 * engine, which is an engine change rather than a local parser here.
 */
function checkAddress(hit: Raise, loc: string, value: string, allow: AllowList): void {
  const street = value.trim();
  // A street line: house number plus at least one word.
  if (!/^\d+\s+\p{L}/u.test(street)) return;
  if (!allow.ids.has(street.toUpperCase())) {
    hit({ segment: loc, value: street, reason: "street address not in synthetic allow-list" });
  }
}

function checkPhone(hit: Raise, loc: string, value: string): void {
  const digits = value.replace(/\D/g, "");
  // A real dialable number is at least 10 digits. The `555` fake-exchange
  // convention (555-01xx is reserved for fiction) marks a synthetic number, and it
  // is this detector's remedy: there is no phone tag in the allow-list, so the
  // convention is what a developer meeting this hit reaches for.
  if (digits.length >= 10 && !digits.includes("555")) {
    hit({ segment: loc, value, reason: "phone number without the 555 fake-exchange convention" });
  }
}

/** An id-shaped value: 9-digit SSN, or a bare 6-15 digit member/cardholder id. */
function checkId(hit: Raise, loc: string, value: string, reason: string, allow: AllowList): void {
  const v = value.trim();
  if (v.length === 0) return;
  if (allow.ids.has(v.toUpperCase())) return;
  const digits = v.replace(/\D/g, "");
  // A bare all-digit id of realistic length is a real-looking SSN / member id.
  // Synthetic fixtures use prefixed shapes, which pass.
  if (/^\d{6,15}$/.test(v) || (v.length === digits.length && digits.length >= 6)) {
    hit({ segment: loc, value: v, reason });
  }
}

// ===========================================================================
// SCRIPT (XML): element-stack walk, tag-scoped detection
// ===========================================================================

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

function scanScript(ctx: DetectContext, xml: string): void {
  const { hit, allow } = ctx;
  for (const leaf of walkXmlLeaves(xml)) {
    const loc = `<${leaf.rawTag}>`;
    if (SCRIPT_NAME_TAGS.has(leaf.tag)) {
      checkName(hit, loc, leaf.text, allow);
    } else if (
      leaf.tag === "dateofbirth" ||
      (leaf.tag === "date" && leaf.parent === "dateofbirth")
    ) {
      checkDob(hit, "<DateOfBirth>", leaf.text, allow);
    } else if (SCRIPT_ID_TAGS.has(leaf.tag)) {
      checkId(hit, loc, leaf.text, `identifier (${loc}) not in synthetic allow-list`, allow);
    } else if (SCRIPT_ADDRESS_TAGS.has(leaf.tag)) {
      checkAddress(hit, loc, leaf.text, allow);
    } else if (SCRIPT_PHONE_TAGS.has(leaf.tag) && leaf.parent === "communicationnumber") {
      checkPhone(hit, loc, leaf.text);
    } else if (leaf.tag === "phonenumber" || leaf.tag === "telephone") {
      checkPhone(hit, loc, leaf.text);
    }
  }
  // The cross-cutting SSN/email floor is the ENGINE's, and it runs once per target
  // whatever this dispatch does. Never call it from here: a target can earn BOTH
  // structural scanners and would otherwise report each shape hit twice.
}

// ===========================================================================
// Telecom (delimited): field-id keyed detection
// ===========================================================================

function scanTelecom(ctx: DetectContext, text: string): void {
  const { hit, allow } = ctx;
  // Tokenize on the union of the three NCPDP separators. Each resulting token is a
  // `<2-char field id><value>` pair; the leading fixed header (which carries no
  // separators, so it is one token) has no PHI field id and is ignored: patient PHI
  // lives only in the field-id-keyed segments, never in the routing header.
  for (const token of text.split(/[\x1c\x1d\x1e]/)) {
    if (token.length < 2) continue;
    const id = token.slice(0, 2);
    const category = TELECOM_PHI_FIELDS[id];
    if (category === undefined) continue;
    const value = token.slice(2);
    switch (category) {
      case "name":
        checkName(hit, id, value, allow);
        break;
      case "dob":
        checkDob(hit, id, value, allow);
        break;
      case "address":
        checkAddress(hit, id, value, allow);
        break;
      case "phone":
        checkPhone(hit, id, value);
        break;
      case "id":
        checkId(hit, id, value, `patient identifier (${id}) not in synthetic allow-list`, allow);
        break;
      case "memberid":
        checkId(
          hit,
          id,
          value,
          `cardholder / member id (${id}) not in synthetic allow-list`,
          allow,
        );
        break;
      default:
        break;
    }
  }
}

// ===========================================================================
// Format detection + dispatch
// ===========================================================================

type Format = "script" | "telecom";

// An element open/self-close/attribute-bearing tag. DELIBERATELY UNANCHORED: it is
// a "does this contain an element tree" test, ANDed below with a document-start
// check, never a whole-string match.
const XML_TAG_SHAPE = /<[A-Za-z][\w:.-]*[\s/>]/;

/**
 * Whether the WHOLE payload is an XML document: a leading `<` (after a BOM and
 * leading whitespace) plus an element tag somewhere. The document-start half is
 * what keeps a TypeScript source carrying a SCRIPT tag in a string literal off the
 * structural scanner: see `detectFormats`'s residual (a).
 */
function isXmlDocument(text: string): boolean {
  const t = text.replace(/^\uFEFF/, "").trimStart();
  return t.startsWith("<") && XML_TAG_SHAPE.test(t);
}

/**
 * Which structural scanners a target earns, from its CONTENT FIRST at every path,
 * with the extension as a fallback only for content that does not self-identify.
 *
 * This used to open with a path predicate and return nothing for everything else,
 * which made the file NAME, not the bytes, decide whether a SCRIPT message was
 * structurally read. Measured on the base commit: one byte-identical SCRIPT
 * document scored 2 hits as `.xml` and exit 0 as `.ts`, `.txt`, `.dat` and `.json`,
 * and exit 0 as `.ncpdp`, where the extension short-circuit routed an XML document
 * into the Telecom tokenizer, which finds no field ids in it. Both directions were
 * the same defect: an extension outranking the bytes in front of it.
 *
 * The rule, and every clause of it is deliberate:
 *   1. NCPDP separators in the bytes -> Telecom.
 *   2. The payload is an XML document -> SCRIPT.
 *   3. Rules 1 and 2 are NOT exclusive. A payload that satisfies both earns BOTH
 *      scanners, in that order, because each content signal is very strong evidence
 *      and neither is proof. This is the answer to a precedence question and it is
 *      deliberately NOT a precedence: ranking one signal over the other makes the
 *      loser's PHI unreadable. One stray `0x1C` inside a note used to send a whole
 *      well-formed SCRIPT document to the Telecom tokenizer, scoring 0 hits at
 *      every extension where the identical document without it scored 2.
 *   4. Only if NEITHER content signal fires, the extension, for a payload that says
 *      nothing about itself (an empty or truncated fixture, or a fragment):
 *      `.ncpdp` -> Telecom, `.xml` -> SCRIPT. Matched case-insensitively.
 *
 * The engine's SSN/email FLOOR is not in this list. It runs on every target exactly
 * once whatever this returns, including the empty array, which is the conservative
 * pass a non-NCPDP target (hand-written `src/`, plain-text notes) gets.
 *
 * KNOWN RESIDUALS. THIS IS NOT A CLOSED LIST. What survives:
 *
 *   a. A message EMBEDDED in a string literal (a SCRIPT fragment inside a `.ts`
 *      test or a JSDoc example) is not structurally scanned, because the payload as
 *      a whole is not a document. It gets the floor, so a dashed SSN or a non-test
 *      email in it is caught but a name or a DOB is not. This is the reason there is
 *      no path predicate rather than a wider one: sniffing XML out of arbitrary
 *      TypeScript is a separate job with its own false-positive surface, and a gate
 *      that cries wolf gets bypassed.
 *   b. Rule 4 routes on a whole-suffix match, so a fragment fixture named
 *      `.xml.txt`, `.xml.bak` or `.ncpdp.orig` gets the floor only.
 *   c. A Telecom payload with NO separator at all (a single field token) is only
 *      reached through rule 4, so one named neither `.ncpdp` nor `.xml` is invisible
 *      to the field-id scan. That is the arm rule 4 exists for, and it is why
 *      deleting it would be a trade rather than a simplification.
 *   d. Rule 4 is reached only when NEITHER content signal fires, so ONE content
 *      signal still suppresses the extension entirely. The stray-separator downgrade
 *      therefore survives ONE LEVEL DOWN, on a payload that is NOT a document: a
 *      `.xml` FRAGMENT (leading prose) carrying a name tag plus one `0x1C` scores 0
 *      hits, where the identical fragment without that byte scores 1.
 *   e. RULE 4 IS DEAD ON THE INDEX HALF OF THE UNION, AND THIS ONE IS NEW WITH
 *      ADOPTION RATHER THAN INHERITED. `DetectContext` carries the reported LOCUS
 *      and not the target's own path, and the locus of a target read out of the git
 *      index carries an origin label, so it ends in `)` and matches neither suffix.
 *      Before adoption this dispatch was handed the bare path on every route. The
 *      fix is `targetPath` on `DetectContext` in the shared engine; it is NOT a
 *      caller-side string transform, because reconstructing the bare path means
 *      parsing engine-owned text, which narrows silently the moment that text
 *      changes. THIS SCANNER IS NOT COMPLETE UNTIL THAT SHIPS.
 *
 * Residuals (a) through (d) are executable rather than merely written down: see the
 * dispatch tests in `test/scripts/phi-scan.test.ts`.
 */
function detectFormats(text: string, locus: string): readonly Format[] {
  const t = text.replace(/^\uFEFF/, "");
  const byContent: Format[] = [];
  if (TELECOM_SEPARATORS.test(t)) byContent.push("telecom");
  if (isXmlDocument(t)) byContent.push("script");
  // ONE content signal is enough to suppress the fallback, which is what leaves
  // residual (d): a fragment the separator test claims but the document test cannot.
  if (byContent.length > 0) return byContent;
  // Fallback ONLY for a payload that said nothing about itself. Load-bearing: it is
  // what keeps a `.xml` FRAGMENT fixture (leading prose, so not a document) and a
  // separator-less `.ncpdp` field token structurally scanned. Do not delete it to
  // simplify the case fold.
  // Residual (e): this is the reported LOCUS, so on the index half of the union it
  // ends in an origin label and matches neither suffix. Left as the plain suffix
  // test rather than papered over with a string transform over engine-owned text.
  const lower = locus.toLowerCase();
  if (lower.endsWith(".ncpdp")) return ["telecom"];
  if (lower.endsWith(".xml")) return ["script"];
  return [];
}

/**
 * The NCPDP-specific field detection: the half the shared engine deliberately does
 * not own, because it differs per healthcare standard.
 *
 * The engine has already run the cross-cutting floor (the SSN and email shapes)
 * over `ctx.text` and reported any hits against the correct locus. Everything here
 * is structural, and every PHI-bearing check consults a declaration: `ctx.allow`
 * for names, DOBs and identifiers, the local `ADDR` entries for street addresses,
 * and the 555 fake-exchange convention for phone numbers.
 *
 * @param ctx The target's text and bytes, the parsed allow-list, and `hit`.
 */
function detect(ctx: DetectContext): void {
  for (const fmt of detectFormats(ctx.text, ctx.path)) {
    if (fmt === "script") scanScript(ctx, ctx.text);
    else scanTelecom(ctx, ctx.text);
  }
}

process.exit(
  runPhiScan({
    exitCodes: EXIT_CODES,
    scanRoots: SCAN_ROOTS,
    isStagedReadable,
    detect,
    // `excludedPaths` is deliberately NOT set: this repo declares no path the scan
    // has no verdict about. `isWalkReadable` is deliberately NOT set either, so the
    // shared Markdown exemption moves for every repo at once through a version bump
    // rather than one edit per repo. `regularBlobModes` is the engine's default,
    // which is the pair this repo already used.
  }),
);
