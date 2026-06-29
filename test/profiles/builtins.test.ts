/**
 * Phase 9 accuracy gate — the locked HARD RULE, enforced in tests:
 *
 *   "A profile entry without a Tier-2 fixture demonstrating the convention is
 *    forbidden. No invented quirks."
 *
 * NCPDP spans two unrelated standards, so the registry holds one built-in per
 * standard (`profiles.surescripts` over SCRIPT, `profiles.pbm` over Telecom).
 * For EVERY shipped quirk, the suite asserts (a) the cited fixture EXISTS under
 * `test/fixtures/`, (b) it parses without throwing on the right standard, and
 * (c) it actually EXHIBITS the claimed convention — via a per-quirk
 * DEMONSTRATOR keyed by `${profile.name}/${quirk.id}`. A quirk with NO
 * demonstrator FAILS the suite, so a real-but-irrelevant fixture cannot slip
 * past a generic exists+parses check.
 *
 * Also documents profile-on / profile-off divergence: a v1 profile attaches
 * attribution but NEVER alters the parse — the body + warnings are identical
 * with and without the profile.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { adjudication, fieldValue, findSegment, parseTelecom } from "../../src/telecom/index.js";
import { parseScript } from "../../src/script/index.js";
import { profiles, type NcpdpProfile } from "../../src/profiles/index.js";
import { loadScriptFixture } from "../_helpers/load-fixture.js";
import { loadTelecomFixture } from "../_helpers/load-fixture.js";

const FIXTURE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

/** Read a fixture by its profile-relative path (`script/…` or `telecom/…`). */
function loadByPath(relPath: string): string {
  const [standard, ...rest] = relPath.split("/");
  const name = rest.join("/");
  return standard === "script" ? loadScriptFixture(name) : loadTelecomFixture(name);
}

const ALL_BUILTINS: readonly NcpdpProfile[] = Object.values(profiles);

/**
 * Per-quirk demonstrators, keyed by `${profile.name}/${quirk.id}`. Each asserts
 * — against the quirk's OWN cited fixture — that the convention it claims is
 * actually present. Every shipped quirk MUST appear here (enforced below).
 */
const DEMONSTRATORS: Record<string, (raw: string) => void> = {
  "surescripts/routing-identifiers": (raw) => {
    const msg = parseScript(raw);
    // To = receiving pharmacy NCPDP ID; From = prescriber SPI. Both present on
    // routed traffic.
    expect(msg.header.to).toBeTruthy();
    expect(msg.header.from).toBeTruthy();
  },
  "surescripts/version-stamp-variance": (raw) => {
    const msg = parseScript(raw);
    expect(msg.warnings.map((w) => w.code)).toContain("NCPDP_SCRIPT_UNSUPPORTED_VERSION_TOLERATED");
  },
  "pbm/person-code-required": (raw) => {
    const tx = parseTelecom(raw);
    const insurance = findSegment(tx.segments, "04");
    expect(insurance).toBeDefined();
    // Person Code (303-C3) distinguishes cardholder (01) from dependent (03+).
    expect(fieldValue(insurance, "C3")).toBe("03");
  },
  "pbm/reject-code-depth": (raw) => {
    const tx = parseTelecom(raw);
    expect(tx.warnings.map((w) => w.code)).toContain("NCPDP_TELECOM_UNKNOWN_REJECT_CODE");
    const adj = adjudication(tx);
    // The unknown reject is preserved verbatim, never dropped, with known:false.
    expect(adj?.status?.rejectCodes.some((r) => r.code === "99" && !r.known)).toBe(true);
  },
  "pbm/response-dur-segment": (raw) => {
    const tx = parseTelecom(raw);
    const adj = adjudication(tx);
    // A Response DUR/PPS (24) clinical alert rides alongside the paid status.
    expect(adj?.dur.length ?? 0).toBeGreaterThan(0);
    expect(adj?.dur[0]?.reasonForServiceCode).toBe("DD");
    expect(adj?.status?.disposition).toBe("paid");
  },
};

describe("built-in profiles — hard rule: every quirk is fixture-grounded", () => {
  it("ships a built-in profile per NCPDP standard", () => {
    expect(ALL_BUILTINS.length).toBeGreaterThan(0);
    const standards = new Set(ALL_BUILTINS.flatMap((p) => p.quirks.map((q) => q.standard)));
    expect(standards.has("script")).toBe(true);
    expect(standards.has("telecom")).toBe(true);
  });

  for (const profile of ALL_BUILTINS) {
    for (const q of profile.quirks) {
      const key = `${profile.name}/${q.id}`;

      it(`${key} cites a fixture that exists and parses`, () => {
        expect(q.fixture).toBeTruthy();
        expect(existsSync(join(FIXTURE_ROOT, q.fixture))).toBe(true);
        const raw = loadByPath(q.fixture);
        if (q.standard === "script") expect(() => parseScript(raw)).not.toThrow();
        else expect(() => parseTelecom(raw)).not.toThrow();
      });

      it(`${key} has a demonstrator that proves the convention in its fixture`, () => {
        const demonstrate = DEMONSTRATORS[key];
        expect(demonstrate, `no demonstrator registered for ${key}`).toBeTypeOf("function");
        demonstrate?.(loadByPath(q.fixture));
      });
    }
  }

  it("registers no demonstrator for a quirk that no built-in ships", () => {
    const shipped = new Set(ALL_BUILTINS.flatMap((p) => p.quirks.map((q) => `${p.name}/${q.id}`)));
    for (const key of Object.keys(DEMONSTRATORS)) {
      expect(shipped.has(key), `demonstrator '${key}' has no matching shipped quirk`).toBe(true);
    }
  });
});

describe("profile-on / profile-off divergence — attribution only, no data loss", () => {
  it("SCRIPT: parses identical body + warnings with and without a profile", () => {
    const raw = loadScriptFixture("surescripts-routing.xml");
    const off = parseScript(raw);
    const on = parseScript(raw, { profile: profiles.surescripts });

    expect(on.profile?.name).toBe("surescripts");
    expect(off.profile).toBeUndefined();
    expect(on.warnings).toEqual(off.warnings);
    expect(on.body).toEqual(off.body);
    expect(on.header).toEqual(off.header);
  });

  it("Telecom: parses identical segments + warnings with and without a profile", () => {
    const raw = loadTelecomFixture("pbm-person-code.ncpdp");
    const off = parseTelecom(raw);
    const on = parseTelecom(raw, { profile: profiles.pbm });

    expect(on.profile?.name).toBe("pbm");
    expect("profile" in off).toBe(false);
    expect(on.warnings).toEqual(off.warnings);
    expect(on.segments).toEqual(off.segments);
    expect(on.header).toEqual(off.header);
  });

  it("Telecom: a clean B1 request fixture parses with zero warnings", () => {
    const tx = parseTelecom(loadTelecomFixture("pbm-person-code.ncpdp"));
    expect(tx.warnings).toEqual([]);
  });

  it("Telecom: the response-DUR fixture parses paid with zero warnings", () => {
    const tx = parseTelecom(loadTelecomFixture("pbm-response-dur.ncpdp"));
    expect(tx.warnings).toEqual([]);
  });
});
