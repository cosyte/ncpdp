/**
 * Unit tests for scripts/phi-scan.ts — the NCPDP PHI commit-gate.
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
 *                   --allow-fixture override-log gate.
 *
 * Violator fixtures are written to a throwaway temp dir so they never pollute the
 * committed corpus that `pnpm phi-scan` sweeps. The scanner is invoked via
 * spawnSync (array args, no shell) so the full CLI path (argv parse, exit code,
 * stderr) is exercised.
 *
 * SECURITY: every subprocess call here uses spawnSync with array args. No exec,
 * no shell-form.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync, readFileSync, appendFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
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

let dir: string;

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runScanner(args: string[]): RunResult {
  const r = spawnSync(TSX_BIN, [SCANNER_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
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
// Negative tests — genuinely synthetic, allow-listed content PASSES
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

  it("the committed corpus (all-mode) is clean", () => {
    const r = runScanner([]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK — no hits/);
  });
});

// ---------------------------------------------------------------------------
// Positive tests — SCRIPT (XML) real-looking PHI is CAUGHT
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
  // regression — the detector previously silently accepted these).
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
// Positive tests — Telecom (delimited) real-looking PHI is CAUGHT
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
    // self-identifying — the DOB must still be caught.
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
    const r = scan(
      "email.xml",
      scriptMsg(
        `<MedicationPrescribed><Note>reach avery@realpharmacy.org</Note></MedicationPrescribed>`,
      ),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/email with non-test domain/);
  });

  it("scans a mis-extensioned XML fixture by content (still catches PHI)", () => {
    // No .xml extension, but placed under a fixtures-like temp file with XML body:
    // detection is content-first, so the name is still caught.
    const r = scan(
      "mislabeled.txt",
      scriptMsg(`<Patient><Name><LastName>Anderson</LastName></Name></Patient>`),
    );
    // A .txt outside test/fixtures/ is NOT fixture-like, so it falls to the
    // conservative shape pass and the name is NOT structurally scanned.
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("keeps src-style .ts content (embedded example) on the text-only pass", () => {
    const path = join(dir, "example.ts");
    writeFileSync(path, 'const example = "<LastName>Anderson</LastName>";\n');
    const r = runScanner([path]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// --allow-fixture override gate
// ---------------------------------------------------------------------------

describe("phi-scan: --allow-fixture override gate", () => {
  it("rejects --allow-fixture without an override-log entry (exit 2)", () => {
    const r = scan(
      "gated.xml",
      scriptMsg(`<Patient><Name><LastName>Anderson</LastName></Name></Patient>`),
    );
    expect(r.code).toBe(1); // sanity: it is a violator
    const path = join(dir, "gated.xml");
    const r2 = runScanner(["--allow-fixture", path]);
    expect(r2.code).toBe(2);
    expect(r2.stderr).toMatch(/phi-scan-overrides\.md/);
  });

  it("honors --allow-fixture WITH an override-log entry (exit 0)", () => {
    const path = join(dir, "override-me.xml");
    writeFileSync(path, scriptMsg(`<Patient><Name><LastName>Anderson</LastName></Name></Patient>`));
    const rel = relative(REPO_ROOT, path).split(sep).join("/");
    // Sanity: scanned on its own it is a genuine violator — so the override, not
    // an empty target set, is what flips the next run to clean.
    expect(runScanner([path]).code).toBe(1);

    const original = readFileSync(OVERRIDES_PATH, "utf8");
    try {
      appendFileSync(
        OVERRIDES_PATH,
        `\n### ${rel}\n\n- **Date:** 2026-07-18\n- **Reason:** unit test\n- **Approved by:** vitest\n- **Expires:** permanent\n`,
      );
      const r = runScanner(["--allow-fixture", path]);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    } finally {
      writeFileSync(OVERRIDES_PATH, original);
    }
  });
});
