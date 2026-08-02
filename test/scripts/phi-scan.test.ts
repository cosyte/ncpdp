/**
 * Unit tests for scripts/phi-scan.ts: the NCPDP PHI commit-gate.
 *
 * NCPDP is two wire formats, so the suite proves the scanner CATCHES real-looking
 * PHI (a weak scanner is worse than none) and PASSES genuinely synthetic,
 * allow-listed fixtures for BOTH:
 *   SCRIPT (XML):   patient name, prescriber name, DOB, SSN/member id, address,
 *                   phone, namespace-prefixed + mixed-case tags, mis-extensioned
 *                   XML, and the "written date is not a DOB" negative.
 *   Telecom:        patient name (CA/CB), DOB (C4), cardholder id (C2), patient id
 *                   (CY), address (CM), phone (CQ), a corrupt Segment-ID that must
 *                   NOT bypass field-id detection, and the routing-header negative.
 *   Cross-cutting:  dashed SSN + non-test email; the committed corpus is clean; the
 *                   --allow-fixture override-log gate; and the EXTENSION
 *                   DIFFERENTIAL, which asserts that byte-identical content gets an
 *                   identical verdict at every extension, because the file name
 *                   used to decide whether a message was structurally read at all.
 *
 * Most violator fixtures are written to a throwaway temp dir so they never pollute
 * the committed corpus that `pnpm phi-scan` sweeps. The scanner is invoked via
 * spawnSync (array args, no shell) so the full CLI path (argv parse, exit code,
 * stderr) is exercised.
 *
 * The override-gate and scan-root suites are the exception and MUST seed inside the
 * repo: a violator in an OS temp dir is never enumerated by an all-mode scan, so
 * overriding it proves nothing, which is precisely how the previous version of this
 * file certified a bug it could not observe. Seeded files are removed in a
 * `finally`, in directories no other module `readdirSync`s (see the seed constants).
 * Two consequences worth knowing: a hard kill mid-run leaves a `zz-phi-scan-seed-*`
 * file behind, which reds the next scan loudly rather than silently; and this file
 * (like the override-log mutation it already did) is not safe to run concurrently
 * against the same checkout. CI gives each job its own.
 *
 * Staged-mode tests never touch THIS repo's git index. They build a throwaway git
 * repo in a temp dir and run the scanner with its cwd pointed there.
 *
 * SECURITY: every subprocess call here uses spawnSync with array args. No exec,
 * no shell-form.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import {
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  readFileSync,
  appendFileSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO_ROOT = process.cwd();
const SCANNER_PATH = join(REPO_ROOT, "scripts", "phi-scan.ts");
const OVERRIDES_PATH = join(REPO_ROOT, "phi-scan-overrides.md");
const TSX_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsx");

// NCPDP Telecom separators (control chars).
const FS = "\x1c";
const RS = "\x1e";

/** A bare-numeric sentinel built from parts so no literal PHI-shaped digit string
 * lives in this source file (keeps CodeQL from flagging a hardcoded secret and
 * keeps the assertions anchored on the value the scanner reports). */
const digits = (...parts: string[]): string => parts.join("");

/** A non-test email built from parts, for the same reason `digits` exists: the
 * scanner now walks all of `test/`, so its own suite is inside the corpus it
 * guards and must not carry a literal address the gate would (correctly) flag. */
const email = (user: string, ...domain: string[]): string => `${user}@${domain.join(".")}`;

let dir: string;

// ---------------------------------------------------------------------------
// In-repo seeding: the only way to test the override gate honestly.
//
// A violator written to an OS temp dir is never enumerated by an all-mode scan,
// so overriding it proves nothing: the run comes back clean because the file was
// never in the target set, not because the override subtracted it. Seeded files
// therefore live under a real scan root and are removed in a `finally`.
// ---------------------------------------------------------------------------

/** A genuine violator: a real-looking patient name in a SCRIPT `<LastName>`. */
const VIOLATOR = `<?xml version="1.0" encoding="UTF-8"?>
<Message xmlns="http://www.ncpdp.org/schema/SCRIPT" version="2017071">
  <Body><NewRx><Patient><HumanPatient><Name><LastName>Anderson</LastName></Name></HumanPatient></Patient></NewRx></Body>
</Message>`;

// Seed locations are chosen so that NO other module enumerates the directory they
// land in. `test/script/serialize.test.ts` does a module-scope `readdirSync` of
// `test/fixtures/script/`, and Vitest runs test files in parallel, so a seed there
// would appear and vanish mid-collection and error that file outright. Seeding one
// directory up, and in `test/scripts/`, avoids every `readdirSync` in the suite.

/** Seeded under `test/fixtures/` (the historical root), but not in a read dir. */
const SEED_IN_FIXTURES = "test/fixtures/zz-phi-scan-seed-fixtures.xml";
/** Seeded under `test/` but OUTSIDE `fixtures/` (the root the scan used to miss). */
const SEED_OUTSIDE_FIXTURES = "test/scripts/zz-phi-scan-seed-outside.xml";

/** Write violators at repo-relative paths, run `fn`, then always remove them. */
function withSeeded<T>(relPaths: readonly string[], fn: () => T): T {
  try {
    for (const rel of relPaths) writeFileSync(join(REPO_ROOT, rel), VIOLATOR);
    return fn();
  } finally {
    for (const rel of relPaths) rmSync(join(REPO_ROOT, rel), { force: true });
  }
}

/** Append override-log entries for `rels`, run `fn`, then always restore the log. */
function withOverrides<T>(rels: readonly string[], fn: () => T): T {
  const original = readFileSync(OVERRIDES_PATH, "utf8");
  try {
    for (const rel of rels) {
      appendFileSync(
        OVERRIDES_PATH,
        `\n### ${rel}\n\n- **Date:** 2026-07-29\n- **Reason:** unit test\n` +
          `- **Approved by:** vitest\n- **Expires:** end of test run\n`,
      );
    }
    return fn();
  } finally {
    writeFileSync(OVERRIDES_PATH, original);
  }
}

/** The denominator the scanner now prints on every report line, or -1 if absent. */
function scannedCount(r: RunResult): number {
  const m = /\((\d+) file\(s\) scanned\)/.exec(`${r.stdout}${r.stderr}`);
  const raw = m?.[1];
  return raw === undefined ? -1 : Number(raw);
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run the scanner with its cwd set to `cwd` (the scanner treats cwd as the repo root). */
function runScannerIn(cwd: string, args: string[]): RunResult {
  const r = spawnSync(TSX_BIN, [SCANNER_PATH, ...args], { cwd, encoding: "utf8", shell: false });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function runScanner(args: string[]): RunResult {
  return runScannerIn(REPO_ROOT, args);
}

/** Write a fixture to the temp dir under a given name and scan it by path. */
function scan(name: string, content: string): RunResult {
  const path = join(dir, name);
  writeFileSync(path, content);
  return runScanner([path]);
}

/** A minimal well-formed SCRIPT NewRx wrapping an inner Patient/body fragment. */
function scriptMsg(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Message xmlns="http://www.ncpdp.org/schema/SCRIPT" version="2017071">
  <Header><MessageID>SYNTH-MSG-0001</MessageID></Header>
  <Body><NewRx>${inner}</NewRx></Body>
</Message>`;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ncpdp-phi-scan-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Negative tests: genuinely synthetic, allow-listed content PASSES
// ---------------------------------------------------------------------------

describe("phi-scan: synthetic / allow-listed content passes (exit 0)", () => {
  it("a clean synthetic SCRIPT message exits 0", () => {
    const r = scan(
      "clean.xml",
      scriptMsg(
        `<Patient><HumanPatient><Name><LastName>Testpatient</LastName><FirstName>Avery</FirstName></Name>` +
          `<DateOfBirth><Date>1990-04-12</Date></DateOfBirth></HumanPatient></Patient>`,
      ),
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("a clean synthetic Telecom message exits 0", () => {
    // Patient DOB C4 (allow-listed) + cardholder C2 (prefixed synthetic).
    const r = scan(
      "clean.ncpdp",
      `999999D0B1PCN0000000101PHARM12345  20260629SW00000000` +
        `${RS}AM01${FS}C419850722${FS}C51${RS}AM04${FS}C2SYNTHCARD09`,
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("a written date under a non-DOB parent is NOT flagged as a DOB", () => {
    const r = scan(
      "written.xml",
      scriptMsg(
        `<Patient><HumanPatient><Name><LastName>Doe</LastName></Name></HumanPatient></Patient>` +
          `<MedicationPrescribed><WrittenDate><Date>2004-07-19</Date></WrittenDate></MedicationPrescribed>`,
      ),
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("a business/org name is NOT flagged as a person name", () => {
    const r = scan(
      "org.xml",
      scriptMsg(`<Pharmacy><BusinessName>Riverside Community Pharmacy</BusinessName></Pharmacy>`),
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("the committed corpus (all-mode) is clean, over a non-trivial number of files", () => {
    const r = runScanner([]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
    // A clean run and a run that scanned nothing print the same words without the
    // denominator. Assert it, so "OK" can never be satisfied by an empty scan.
    expect(scannedCount(r)).toBeGreaterThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// Positive tests: SCRIPT (XML) real-looking PHI is CAUGHT
// ---------------------------------------------------------------------------

describe("phi-scan SCRIPT: names", () => {
  it("catches a real patient name in <LastName>/<FirstName>", () => {
    const r = scan(
      "name.xml",
      scriptMsg(
        `<Patient><HumanPatient><Name><LastName>Anderson</LastName><FirstName>Michael</FirstName></Name></HumanPatient></Patient>`,
      ),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/LastName/);
    expect(r.stderr).toMatch(/Anderson/);
    expect(r.stderr).toMatch(/Michael/);
  });

  it("catches a real prescriber name (provider names are PHI too)", () => {
    const r = scan(
      "prescriber.xml",
      scriptMsg(
        `<Prescriber><NonVeterinarian><Name><LastName>Kowalski</LastName><FirstName>Ewa</FirstName></Name></NonVeterinarian></Prescriber>`,
      ),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/Kowalski/);
  });

  it("catches a name in a namespace-prefixed, mixed-case tag", () => {
    const r = scan(
      "ns.xml",
      scriptMsg(`<Patient><Name><ns:LASTNAME>Okafor</ns:LASTNAME></Name></Patient>`),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/Okafor/);
  });
});

describe("phi-scan SCRIPT: date of birth", () => {
  it("catches a DOB not in the allow-list", () => {
    const r = scan(
      "dob.xml",
      scriptMsg(
        `<Patient><HumanPatient><Name><LastName>Doe</LastName></Name>` +
          `<DateOfBirth><Date>1977-07-07</Date></DateOfBirth></HumanPatient></Patient>`,
      ),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/DateOfBirth/);
    expect(r.stderr).toMatch(/19770707/);
  });

  // A DOB-scoped field must fail CLOSED: a real DOB in a non-year-first rendering
  // must NOT slip through just because the normalizer expects CCYYMMDD (refuter
  // regression: the detector previously silently accepted these).
  it.each([
    ["us-slash.xml", "07/07/1977"],
    ["eu-dot.xml", "13.11.1975"],
    ["spelled.xml", "November 30, 1975"],
    ["dd-mon.xml", "30-NOV-1975"],
  ])("catches a non-year-first DOB rendering (%s)", (file, date) => {
    const r = scan(
      file,
      scriptMsg(
        `<Patient><HumanPatient><DateOfBirth><Date>${date}</Date></DateOfBirth></HumanPatient></Patient>`,
      ),
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/DateOfBirth/);
  });

  it("does NOT flag an empty DOB field (no date signal)", () => {
    const r = scan(
      "empty-dob.xml",
      scriptMsg(
        `<Patient><HumanPatient><DateOfBirth><Date></Date></DateOfBirth></HumanPatient></Patient>`,
      ),
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

describe("phi-scan SCRIPT: identifiers", () => {
  it("catches an SSN in <SocialSecurity>", () => {
    const ssn = digits("900", "55", "0001"); // 9xx area = never a real SSN
    const r = scan(
      "ssn.xml",
      scriptMsg(
        `<Patient><HumanPatient><Identification><SocialSecurity>${ssn}</SocialSecurity></Identification></HumanPatient></Patient>`,
      ),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/SocialSecurity/);
    expect(r.stderr).toMatch(new RegExp(ssn));
  });

  it("catches a bare-numeric member id in <CardholderID>", () => {
    const id = digits("48291", "043");
    const r = scan(
      "member.xml",
      scriptMsg(
        `<Benefit><PayerIdentification><CardholderID>${id}</CardholderID></PayerIdentification></Benefit>`,
      ),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/CardholderID/);
    expect(r.stderr).toMatch(new RegExp(id));
  });
});

describe("phi-scan SCRIPT: address + phone", () => {
  it("catches a real street address", () => {
    const r = scan(
      "addr.xml",
      scriptMsg(
        `<Patient><Address><AddressLine1>742 Evergreen Terrace</AddressLine1></Address></Patient>`,
      ),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/AddressLine1/);
    expect(r.stderr).toMatch(/Evergreen/);
  });

  it("catches a phone without the 555 fake-exchange convention", () => {
    const phone = digits("312", "867", "5309");
    const r = scan(
      "phone.xml",
      scriptMsg(
        `<Patient><CommunicationNumber><Number>${phone}</Number><Qualifier>TE</Qualifier></CommunicationNumber></Patient>`,
      ),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/Number/);
  });
});

// ---------------------------------------------------------------------------
// Positive tests: Telecom (delimited) real-looking PHI is CAUGHT
// ---------------------------------------------------------------------------

const TELECOM_HEADER = "999999D0B1PCN0000000101PHARM12345  20260629SW00000000";

describe("phi-scan Telecom: patient segment", () => {
  it("catches a patient name in CB/CA", () => {
    const r = scan(
      "name.ncpdp",
      `${TELECOM_HEADER}${RS}AM01${FS}CBAnderson${FS}CAMichael${FS}C419850722`,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/location=CB/);
    expect(r.stderr).toMatch(/Anderson/);
    expect(r.stderr).toMatch(/location=CA/);
  });

  it("catches a DOB in C4", () => {
    const r = scan("dob.ncpdp", `${TELECOM_HEADER}${RS}AM01${FS}C419770707`);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/location=C4/);
    expect(r.stderr).toMatch(/19770707/);
  });

  it("catches a non-year-first DOB in C4 (fails closed)", () => {
    const r = scan("dob-slash.ncpdp", `${TELECOM_HEADER}${RS}AM01${FS}C407/07/1977`);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/location=C4/);
  });

  it("catches a bare-numeric cardholder id in C2", () => {
    const id = digits("30000", "1234");
    const r = scan("member.ncpdp", `${TELECOM_HEADER}${RS}AM04${FS}C2${id}`);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/location=C2/);
    expect(r.stderr).toMatch(new RegExp(id));
  });

  it("catches an SSN-shaped patient id in CY", () => {
    const ssn = digits("900", "55", "0002");
    const r = scan("patid.ncpdp", `${TELECOM_HEADER}${RS}AM01${FS}CY${ssn}`);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/location=CY/);
    expect(r.stderr).toMatch(new RegExp(ssn));
  });

  it("catches a street address in CM and a non-555 phone in CQ", () => {
    const phone = digits("312", "867", "5309");
    const r = scan(
      "addr.ncpdp",
      `${TELECOM_HEADER}${RS}AM01${FS}CM742 Evergreen Terrace${FS}CQ${phone}`,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/location=CM/);
    expect(r.stderr).toMatch(/Evergreen/);
    expect(r.stderr).toMatch(/location=CQ/);
  });

  it("field-id detection is NOT bypassed by a corrupt Segment Identification", () => {
    // The AM value is garbage (segment mislabeled), but the C4 field id is still
    // self-identifying: the DOB must still be caught.
    const r = scan("corrupt-seg.ncpdp", `${TELECOM_HEADER}${RS}AMZZ${FS}C419770707`);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/location=C4/);
    expect(r.stderr).toMatch(/19770707/);
  });

  it("the routing header alone (no patient fields) is clean", () => {
    const r = scan("header-only.ncpdp", `${TELECOM_HEADER}${RS}AM21${FS}ANP`);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting shape checks + format detection
// ---------------------------------------------------------------------------

describe("phi-scan: cross-cutting shape checks", () => {
  it("catches a dashed SSN in a SCRIPT free-text note", () => {
    const ssn = [digits("900"), digits("55"), digits("0003")].join("-");
    const r = scan(
      "note.xml",
      scriptMsg(`<MedicationPrescribed><Note>SSN on file ${ssn}</Note></MedicationPrescribed>`),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/dashed SSN pattern/);
  });

  it("catches a non-test email anywhere", () => {
    const addr = email("avery", "realpharmacy", "org");
    const r = scan(
      "email.xml",
      scriptMsg(`<MedicationPrescribed><Note>reach ${addr}</Note></MedicationPrescribed>`),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/email with non-test domain/);
  });

  it("scans a mis-extensioned XML fixture by content (still catches PHI)", () => {
    // THIS TEST USED TO ASSERT THE OPPOSITE OF ITS OWN TITLE. It was named for the
    // content-first claim and pinned exit 0 (no hits), with a comment explaining
    // that a non-fixture-like path fell to the conservative shape pass. That was a
    // faithful description of the code and a false description of the gate, and it
    // is why the gap read as covered. The assertion is what changed: detection is
    // now genuinely content-first, so the title is the contract.
    const r = scan(
      "mislabeled.txt",
      scriptMsg(`<Patient><Name><LastName>Anderson</LastName></Name></Patient>`),
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/location=<LastName>/);
    expect(r.stderr).toMatch(/Anderson/);
  });

  it("gives byte-identical SCRIPT content the same verdict at EVERY extension", () => {
    // The defect this suite exists to keep closed: the file NAME decided whether a
    // SCRIPT message was structurally read. Measured on the base commit, one
    // byte-identical document scored 2 hits as `.xml`, exit 0 as `.ts` / `.txt` /
    // `.dat` / `.json`, and exit 0 as `.ncpdp` (where the extension routed XML into
    // the Telecom tokenizer, which finds no field ids in it). Asserting SAMENESS
    // rather than a per-extension expectation is deliberate: within the list below it
    // reds on a name-keyed gate whatever shape that gate takes.
    //
    // BOUND ON ITS REACH TWICE, because a test that overstates what it covers is how
    // the gap it replaces stayed hidden. It holds for SELF-IDENTIFYING payloads only:
    // a payload the content test declines (a fragment, an empty file) still routes on
    // its extension by design, and this body cannot observe that arm. The
    // `.xml`-fragment test below is the one that pins it, and residual (c) in
    // `detectFormat` records that the arm is case-sensitive. And the extension LIST is
    // finite, so a gate keyed on something outside it is invisible here: a seeded
    // `path.endsWith(".md") || <no dot in the basename> -> "none"` leaves every test in
    // this file green. Widen the list when you learn of a shape; do not read this as
    // covering all names.
    const body = scriptMsg(
      `<Patient><HumanPatient><Name><LastName>Anderson</LastName>` +
        `<FirstName>Marguerite</FirstName></Name></HumanPatient></Patient>`,
    );
    const results = ["xml", "ncpdp", "ts", "txt", "dat", "json", "XML", "edi"].map((ext) => ({
      ext,
      r: scan(`differential.${ext}`, body),
    }));
    const first = results[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    // Pinned, so "all identical" can never be satisfied by all-clean.
    expect(first.r.code, `stderr: ${first.r.stderr}`).toBe(1);
    expect(first.r.stderr).toMatch(/location=<LastName>/);
    expect(first.r.stderr).toMatch(/location=<FirstName>/);
    for (const { ext, r } of results) {
      expect(r.code, `.${ext} diverged; stderr: ${r.stderr}`).toBe(first.r.code);
      // Compare the hit lines themselves, not just the exit code: a scan routed to
      // the WRONG NCPDP format also exits 1 whenever the shape pass finds anything.
      const locations = (s: string): string[] =>
        [...s.matchAll(/^ {2}location=(\S+)/gm)].map((m) => m[1] ?? "").sort();
      expect(locations(r.stderr), `.${ext} hit locations diverged`).toEqual(
        locations(first.r.stderr),
      );
    }
  });

  it("gives byte-identical Telecom content the same verdict at EVERY extension", () => {
    const body = `${TELECOM_HEADER}${RS}AM01${FS}CBAnderson${FS}C4${digits("1977", "07", "07")}`;
    const results = ["ncpdp", "xml", "ts", "txt", "dat"].map((ext) => ({
      ext,
      r: scan(`differential-telecom.${ext}`, body),
    }));
    const first = results[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.r.code, `stderr: ${first.r.stderr}`).toBe(1);
    expect(first.r.stderr).toMatch(/location=CB/);
    expect(first.r.stderr).toMatch(/location=C4/);
    for (const { ext, r } of results) {
      expect(r.code, `.${ext} diverged; stderr: ${r.stderr}`).toBe(first.r.code);
      expect(r.stderr.replace(/differential-telecom\.\w+/g, "<path>")).toBe(
        first.r.stderr.replace(/differential-telecom\.\w+/g, "<path>"),
      );
    }
  });

  it("keeps the extension as a FALLBACK, so no .xml coverage was traded away", () => {
    // Content-first must not become content-ONLY, or the widening would be a trade
    // rather than a superset. A `.xml` fixture whose payload is a FRAGMENT (leading
    // prose, so it does not start with `<`) fails the document test; the base commit
    // scanned it structurally on the extension alone, and it still must. This is the
    // assertion that would red if someone "simplified" `detectFormat` by deleting
    // the two extension arms.
    const r = scan(
      "fragment.xml",
      `preamble text, then a fragment\n<LastName>Anderson</LastName>\n`,
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/location=<LastName>/);
  });

  it("KNOWN RESIDUAL: a message EMBEDDED in a string literal is not structurally scanned", () => {
    // This is the gap the widening deliberately did NOT close, made executable so it
    // is a decision rather than an accident. The payload as a whole is not a document
    // (it does not start with `<`), so it gets the conservative shape pass: a dashed
    // SSN or a non-test email in it IS caught, a name or a DOB is NOT. Sniffing XML
    // out of arbitrary TypeScript has its own false-positive surface, and a PHI gate
    // that cries wolf gets bypassed. If this test ever reds, the gate got WIDER, not
    // narrower: re-read the false-positive argument before deleting it.
    const path = join(dir, "example.ts");
    writeFileSync(path, 'const example = "<LastName>Anderson</LastName>";\n');
    const r = runScanner([path]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);

    // ...and the shape pass over that same embedded literal is NOT vacuous.
    const withSsn = join(dir, "example-ssn.ts");
    const ssn = [digits("900"), digits("55"), digits("0009")].join("-");
    writeFileSync(withSsn, `const example = "<Note>SSN ${ssn}</Note>";\n`);
    const r2 = runScanner([withSsn]);
    expect(r2.code, `stderr: ${r2.stderr}`).toBe(1);
    expect(r2.stderr).toMatch(/dashed SSN pattern/);
  });
});

// ---------------------------------------------------------------------------
// Dispatch: the two content signals are not exclusive, and the fallback arm is
// case-insensitive.
//
// These pin the two residuals the content-first dispatch measured and left open.
// Both were verified RED on `e1d9a34` (the commit that shipped content-first
// dispatch) before this block existed, with the differentials named per test. They
// are pins first: the point is that the next `detectFormats` change cannot reopen
// either one silently.
// ---------------------------------------------------------------------------

/** Sorted `location=` values from a run, the same comparison the extension
 * differential above uses: an exit code alone cannot tell a structural hit from a
 * shape hit, and a wrongly-routed scan still exits 1 whenever the shape pass fires. */
function hitLocations(stderr: string): string[] {
  return [...stderr.matchAll(/^ {2}location=(\S+)/gm)].map((m) => m[1] ?? "").sort();
}

describe("phi-scan dispatch: content signals are not exclusive", () => {
  it("one stray separator byte does NOT downgrade a whole SCRIPT document", () => {
    // MEASURED ON `e1d9a34`: this document scored 0 hits at EVERY extension, `.xml`
    // included, because a single `0x1C` anywhere satisfied the Telecom test and the
    // Telecom tokenizer finds no field ids in XML. The identical document without
    // that byte scored 2 at every extension, which is the differential: one byte of
    // corruption, in a `<Note>` the patient block does not even touch, silenced the
    // whole gate. Real-world bytes are exactly where a stray control character comes
    // from, so this is the direction that matters.
    const inner =
      `<Patient><HumanPatient><Name><LastName>Anderson</LastName>` +
      `<FirstName>Marguerite</FirstName></Name></HumanPatient></Patient>`;
    const clean = scriptMsg(inner);
    const strayed = scriptMsg(
      `${inner}<MedicationPrescribed><Note>dispensed${FS}as written</Note></MedicationPrescribed>`,
    );

    const baseline = scan("stray-baseline.xml", clean);
    expect(baseline.code, `stderr: ${baseline.stderr}`).toBe(1);
    expect(hitLocations(baseline.stderr)).toEqual(["<FirstName>", "<LastName>"]);

    for (const ext of ["xml", "XML", "ncpdp", "ts", "txt", "dat", "json"]) {
      const r = scan(`stray.${ext}`, strayed);
      expect(r.code, `.${ext} did not red; stderr: ${r.stderr}`).toBe(1);
      expect(hitLocations(r.stderr), `.${ext} hit locations diverged`).toEqual(
        hitLocations(baseline.stderr),
      );
    }
  });

  it("keeps the field-id scan on a Telecom transmission inside an XML envelope", () => {
    // The other direction, and the reason the fix is a UNION rather than a flipped
    // precedence. Ranking the XML signal over the separator signal would have closed
    // the test above by opening this one: a Telecom message carried inside an XML
    // document is a document AND has separators, and it must still be tokenized on
    // its field ids. Neither content signal outranks the other.
    const r = scan(
      "enveloped.xml",
      scriptMsg(
        `<Attachment>${TELECOM_HEADER}${RS}AM01${FS}CBAnderson${FS}C4${digits("1977", "07", "07")}</Attachment>`,
      ),
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(hitLocations(r.stderr)).toEqual(["C4", "CB"]);
  });

  it("reports a cross-cutting shape hit ONCE when both scanners run", () => {
    // The bookkeeping half of the union. Each structural scanner used to call the
    // shape pass itself, so a payload earning both would have reported every dashed
    // SSN twice: a gate that double-counts is a gate whose numbers stop being read.
    const ssn = [digits("900"), digits("55"), digits("0007")].join("-");
    const r = scan(
      "both-shapes.xml",
      scriptMsg(`<MedicationPrescribed><Note>SSN ${ssn}${FS}on file</Note></MedicationPrescribed>`),
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr.match(/dashed SSN pattern/g) ?? []).toHaveLength(1);
  });
});

describe("phi-scan dispatch: the extension fallback is case-insensitive", () => {
  it("routes a `.XML` FRAGMENT exactly as it routes `.xml`", () => {
    // MEASURED ON `e1d9a34`: `.xml` -> 1 hit `<LastName>`, `.XML` and `.Xml` -> 0.
    // A fragment is the only payload this arm decides, since a document routes on
    // its own bytes; that is why the differential has to be built from one.
    const fragment = `preamble text, then a fragment\n<LastName>Anderson</LastName>\n`;
    const lower = scan("case-fragment.xml", fragment);
    expect(lower.code, `stderr: ${lower.stderr}`).toBe(1);
    expect(hitLocations(lower.stderr)).toEqual(["<LastName>"]);
    for (const ext of ["XML", "Xml", "xML"]) {
      const r = scan(`case-fragment.${ext}`, fragment);
      expect(r.code, `.${ext} did not red; stderr: ${r.stderr}`).toBe(1);
      expect(hitLocations(r.stderr), `.${ext} diverged from .xml`).toEqual(
        hitLocations(lower.stderr),
      );
    }
  });

  it("routes a `.NCPDP` separator-less field token exactly as it routes `.ncpdp`", () => {
    // The Telecom half of the same arm, and it needs a payload with NO separator:
    // one WITH a separator routes on its bytes, so it could never observe the
    // extension. MEASURED ON `e1d9a34`: `.ncpdp` -> 1 hit `CB`, `.NCPDP` -> 0.
    const token = `CBAnderson`;
    const lower = scan("case-token.ncpdp", token);
    expect(lower.code, `stderr: ${lower.stderr}`).toBe(1);
    expect(hitLocations(lower.stderr)).toEqual(["CB"]);
    for (const ext of ["NCPDP", "Ncpdp", "nCpDp"]) {
      const r = scan(`case-token.${ext}`, token);
      expect(r.code, `.${ext} did not red; stderr: ${r.stderr}`).toBe(1);
      expect(hitLocations(r.stderr), `.${ext} diverged from .ncpdp`).toEqual(
        hitLocations(lower.stderr),
      );
    }
  });

  it("KNOWN RESIDUAL: the fallback still matches the WHOLE suffix only", () => {
    // The case fold widens which NAMES match; it does not widen the SHAPE that
    // matches. A fragment named `.xml.bak` or `.ncpdp.orig` still gets the shape
    // pass only. Written down and pinned rather than closed: a suffix-anywhere match
    // would route on any name containing `.xml`, and the false-positive argument
    // that deleted the path predicate applies here too. If this test ever reds, the
    // fallback got wider: re-read that argument before deleting it.
    const fragment = scan("residual-fragment.xml.bak", `prose\n<LastName>Anderson</LastName>\n`);
    expect(fragment.code, `stderr: ${fragment.stderr}`).toBe(0);
    const token = scan("residual-token.ncpdp.orig", `CBAnderson`);
    expect(token.code, `stderr: ${token.stderr}`).toBe(0);
  });

  it("KNOWN RESIDUAL: a separator-less Telecom token is reached ONLY by the fallback", () => {
    // This is the arm's whole reason for existing, stated as a limit rather than a
    // claim: a single field token has no separator, so no content signal fires and a
    // file named neither `.ncpdp` nor `.xml` is invisible to the field-id scan. That
    // is also why deleting the fallback to "simplify" the case fold would be a
    // trade, not a simplification: it would take the `.ncpdp` case above with it.
    const r = scan("residual-token.dat", `CBAnderson`);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// --allow-fixture override gate
// ---------------------------------------------------------------------------

describe("phi-scan: --allow-fixture override gate", () => {
  it("rejects --allow-fixture without an override-log entry (exit 2)", () => {
    withSeeded([SEED_IN_FIXTURES], () => {
      // Sanity: the seeded file is a genuine violator of an all-mode scan.
      const sanity = runScanner([]);
      expect(sanity.code).toBe(1);
      expect(sanity.stderr).toMatch(/zz-phi-scan-seed-fixtures/);

      const r = runScanner(["--allow-fixture", SEED_IN_FIXTURES]);
      expect(r.code).toBe(2);
      expect(r.stderr).toMatch(/phi-scan-overrides\.md/);
    });
  });

  it("honors --allow-fixture WITH an override-log entry, subtracting ONLY that file", () => {
    withSeeded([SEED_IN_FIXTURES, SEED_OUTSIDE_FIXTURES], () => {
      withOverrides([SEED_IN_FIXTURES], () => {
        const r = runScanner(["--allow-fixture", SEED_IN_FIXTURES]);
        // The overridden file is gone from the report; the OTHER violator is not.
        // This is the assertion that distinguishes a real subtraction from a
        // collapse: a collapsed scan would report neither and exit 0.
        expect(r.code, `stderr: ${r.stderr}`).toBe(1);
        expect(r.stderr).not.toMatch(/zz-phi-scan-seed-fixtures/);
        expect(r.stderr).toMatch(/zz-phi-scan-seed-outside/);
      });
    });
  });

  it("an override flips the run clean only because the rest of the corpus was still scanned", () => {
    withSeeded([SEED_IN_FIXTURES, SEED_OUTSIDE_FIXTURES], () => {
      withOverrides([SEED_IN_FIXTURES, SEED_OUTSIDE_FIXTURES], () => {
        const r = runScanner([
          "--allow-fixture",
          SEED_IN_FIXTURES,
          "--allow-fixture",
          SEED_OUTSIDE_FIXTURES,
        ]);
        expect(r.code, `stderr: ${r.stderr}`).toBe(0);
        // The whole corpus minus two files, NOT an empty set.
        expect(scannedCount(r)).toBeGreaterThanOrEqual(100);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// The observation invariant: the scan must never report OK over nothing.
//
// This block exists because the previous suite asserted the opposite and was
// wrong: `--allow-fixture X` with no positional path used to seed the target set
// with `[X]`, subtract `X`, scan zero files, print "OK: no hits" and exit 0. The
// old test read that exit 0 as proof the override worked.
// ---------------------------------------------------------------------------

describe("phi-scan: the scan can never observe nothing", () => {
  it("a bare --allow-fixture scans the whole corpus MINUS that file, not just that file", () => {
    withSeeded([SEED_IN_FIXTURES, SEED_OUTSIDE_FIXTURES], () => {
      withOverrides([SEED_IN_FIXTURES], () => {
        const r = runScanner(["--allow-fixture", SEED_IN_FIXTURES]);
        // The denominator is the direct observation: a collapsed run scanned 0.
        expect(scannedCount(r)).toBeGreaterThanOrEqual(100);
      });
    });
  });

  it("refuses (exit 2) when overrides would empty the target set", () => {
    withSeeded([SEED_IN_FIXTURES], () => {
      withOverrides([SEED_IN_FIXTURES], () => {
        // paths-mode with exactly one named target, and that target overridden.
        const r = runScanner([SEED_IN_FIXTURES, "--allow-fixture", SEED_IN_FIXTURES]);
        expect(r.code, `stdout: ${r.stdout} stderr: ${r.stderr}`).toBe(2);
        expect(r.stderr).toMatch(/observe nothing/);
      });
    });
  });

  it("refuses (exit 2) an override that subtracts nothing", () => {
    // Logged, so the override-log gate passes, but it matches no scanned file:
    // a stale entry that reads as a live bypass while doing nothing.
    const stale = "test/fixtures/script/zz-phi-scan-never-existed.xml";
    withOverrides([stale], () => {
      const r = runScanner(["--allow-fixture", stale]);
      expect(r.code, `stdout: ${r.stdout} stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toMatch(/matched no scanned file/);
    });
  });

  it("reports the denominator alongside every OK", () => {
    const r = runScanner([]);
    expect(r.stdout).toMatch(/OK: no hits \(\d+ file\(s\) scanned\)/);
  });
});

// ---------------------------------------------------------------------------
// --staged: the pre-commit path
// ---------------------------------------------------------------------------

/** Padding that makes git score a modified copy as a RENAME rather than add+delete. */
const PADDING = Array.from({ length: 60 }, (_, i) => `  <Filler>padding line ${i}</Filler>`).join(
  "\n",
);

/**
 * Build a throwaway git repo the scanner can run inside: its own allow-list, an
 * empty override log, and a git identity. Staged-mode needs a real git index, and
 * mutating THIS repo's index from a test is not an acceptable way to get one.
 */
function makeScratchRepo(): { root: string; git: (...a: string[]) => string } {
  const root = mkdtempSync(join(tmpdir(), "ncpdp-phi-scan-repo-"));
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "test", "fixtures", "script"), { recursive: true });
  copyFileSync(
    join(REPO_ROOT, "scripts", "phi-allow-list.txt"),
    join(root, "scripts", "phi-allow-list.txt"),
  );
  writeFileSync(join(root, "phi-scan-overrides.md"), "# phi-scan bypass log\n\n## Entries\n\n");
  const git = (...a: string[]): string =>
    spawnSync("git", a, { cwd: root, encoding: "utf8", shell: false }).stdout ?? "";
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  return { root, git };
}

describe("phi-scan --staged", () => {
  it("catches PHI added to a staged fixture", () => {
    const { root, git } = makeScratchRepo();
    try {
      const rel = "test/fixtures/script/newrx.xml";
      writeFileSync(join(root, rel), `<Message>\n${PADDING}\n</Message>`);
      git("add", "-A");
      git("commit", "-qm", "base");
      writeFileSync(
        join(root, rel),
        `<Message><Name><LastName>Kowalczyk</LastName></Name>\n${PADDING}\n</Message>`,
      );
      git("add", "-A");
      const r = runScannerIn(root, ["--staged"]);
      expect(r.code, `stdout: ${r.stdout} stderr: ${r.stderr}`).toBe(1);
      expect(r.stderr).toMatch(/Kowalczyk/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("catches PHI in a fixture that was RENAMED and edited in the same commit", () => {
    // `--diff-filter=AM` does not match an `R` entry, and git detects renames by
    // default, so a `git mv` plus a small edit used to stage real PHI that the
    // pre-commit gate never opened: it printed OK over a plausible denominator.
    const { root, git } = makeScratchRepo();
    try {
      writeFileSync(
        join(root, "test/fixtures/script/orig.xml"),
        `<Message>\n${PADDING}\n</Message>`,
      );
      git("add", "-A");
      git("commit", "-qm", "base");
      git("mv", "test/fixtures/script/orig.xml", "test/fixtures/script/moved.xml");
      writeFileSync(
        join(root, "test/fixtures/script/moved.xml"),
        `<Message><Name><LastName>Kowalczyk</LastName></Name>\n${PADDING}\n</Message>`,
      );
      git("add", "-A");
      // Precondition: git really did score this as a rename. Without this the test
      // could pass on an add+delete and prove nothing about the blind spot.
      expect(git("diff", "--cached", "--name-status")).toMatch(/^R\d+/m);

      const r = runScannerIn(root, ["--staged"]);
      expect(r.code, `stdout: ${r.stdout} stderr: ${r.stderr}`).toBe(1);
      expect(r.stderr).toMatch(/Kowalczyk/);
      expect(r.stderr).toMatch(/moved\.xml/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("catches PHI in a staged TYPECHANGE (symlink replaced by a real file)", () => {
    // Staged as `T`, which an upper-case `--diff-filter` allow-list does not name.
    // This is the test for the POLARITY of that filter, not for one more letter:
    // `--diff-filter=d` enumerates every status except deletions, so a letter nobody
    // thought of costs a wasted scan rather than a missed one.
    const { root, git } = makeScratchRepo();
    try {
      writeFileSync(
        join(root, "test/fixtures/script/real.xml"),
        `<Message>\n${PADDING}\n</Message>`,
      );
      symlinkSync("real.xml", join(root, "test/fixtures/script/link.xml"));
      git("add", "-A");
      git("commit", "-qm", "base");
      rmSync(join(root, "test/fixtures/script/link.xml"), { force: true });
      writeFileSync(
        join(root, "test/fixtures/script/link.xml"),
        `<Message><Name><LastName>Kowalczyk</LastName></Name></Message>`,
      );
      git("add", "-A");
      expect(git("diff", "--cached", "--name-status")).toMatch(/^T/m);

      const r = runScannerIn(root, ["--staged"]);
      expect(r.code, `stdout: ${r.stdout} stderr: ${r.stderr}`).toBe(1);
      expect(r.stderr).toMatch(/Kowalczyk/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not enumerate a staged DELETION (no blob to read)", () => {
    const { root, git } = makeScratchRepo();
    try {
      writeFileSync(
        join(root, "test/fixtures/script/gone.xml"),
        `<Message>\n${PADDING}\n</Message>`,
      );
      git("add", "-A");
      git("commit", "-qm", "base");
      git("rm", "-q", "test/fixtures/script/gone.xml");
      const r = runScannerIn(root, ["--staged"]);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      expect(scannedCount(r)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("nothing staged is the one legitimate empty scan (exit 0, denominator 0)", () => {
    const { root, git } = makeScratchRepo();
    try {
      writeFileSync(
        join(root, "test/fixtures/script/newrx.xml"),
        `<Message>\n${PADDING}\n</Message>`,
      );
      git("add", "-A");
      git("commit", "-qm", "base");
      const r = runScannerIn(root, ["--staged"]);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      expect(scannedCount(r)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Scan roots: the second way this gate was narrowed
// ---------------------------------------------------------------------------

describe("phi-scan: scan roots", () => {
  it("scans test/ OUTSIDE test/fixtures/ (the roots used to stop at fixtures/)", () => {
    withSeeded([SEED_OUTSIDE_FIXTURES], () => {
      const r = runScanner([]);
      expect(r.code, `stdout: ${r.stdout}`).toBe(1);
      expect(r.stderr).toMatch(/zz-phi-scan-seed-outside/);
      expect(r.stderr).toMatch(/Anderson/);
    });
  });

  it("scans scripts/ (tracked hand-written text, on the conservative pass)", () => {
    const seed = "scripts/zz-phi-scan-seed.txt";
    const ssn = [digits("900"), digits("55"), digits("0004")].join("-");
    try {
      writeFileSync(join(REPO_ROOT, seed), `contact on file ${ssn}\n`);
      const r = runScanner([]);
      expect(r.code, `stdout: ${r.stdout}`).toBe(1);
      expect(r.stderr).toMatch(/zz-phi-scan-seed\.txt/);
      expect(r.stderr).toMatch(/dashed SSN pattern/);
    } finally {
      rmSync(join(REPO_ROOT, seed), { force: true });
    }
  });
});
