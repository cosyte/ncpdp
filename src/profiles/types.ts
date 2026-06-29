/**
 * Type definitions for the `@cosyte/ncpdp` profile subsystem (Phase 9).
 *
 * A profile captures **trading-partner / companion-guide conventions** as
 * typed, documented, fixture-grounded data — never silent leniency. It mirrors
 * the `@cosyte/x12` / `@cosyte/hl7` `defineProfile` shape, adapted to NCPDP's
 * reality: NCPDP is **two structurally unrelated standards** (SCRIPT XML
 * ePrescribing and the Telecommunication byte-framed claim standard), so every
 * quirk carries a {@link NcpdpStandard} discriminator and the registry spans
 * both — a Surescripts SCRIPT profile and a PBM/clearinghouse Telecom profile
 * coexist under one API.
 *
 * **Hard rule (locked, matches x12/hl7/ccda):** every {@link NcpdpProfileQuirk}
 * MUST cite a real Tier-2 `fixture` that demonstrates the convention. There are
 * **no invented quirks** — the `fixture` field is required at the type level and
 * verified by the accuracy test (`test/profiles/builtins.test.ts`), which parses
 * each cited fixture and asserts it actually exhibits the claimed convention.
 *
 * **What a profile does (v1).** The lenient parser already absorbs every corpus
 * convention losslessly. So a v1 profile is **descriptive + expectation-tagging**,
 * not parse-altering: it (a) documents the conventions via
 * {@link NcpdpProfile.describe}, (b) attaches to the parse result for attribution
 * (`msg.profile` / `tx.profile`), and (c) partitions a parse's warnings into
 * expected-vs-unexpected via the union of each quirk's `expectedWarnings` (see
 * `partitionWarnings`). A profile NEVER silently swallows data or changes the
 * parse — that is the whole point of making the convention explicit.
 */

import type { ScriptWarningCode } from "../common/warnings.js";
import type { TelecomWarningCode } from "../telecom/warnings.js";

/**
 * Which NCPDP standard a quirk applies to. SCRIPT and Telecom are unrelated
 * formats with disjoint warning registries; a quirk is grounded in exactly one.
 *
 * @example
 * ```ts
 * import type { NcpdpStandard } from "@cosyte/ncpdp/profiles";
 * const std: NcpdpStandard = "telecom";
 * ```
 */
export type NcpdpStandard = "script" | "telecom";

/**
 * The union of every public warning code across both standards. A quirk's
 * `expectedWarnings` is drawn from this set and validated against it.
 *
 * @example
 * ```ts
 * import type { NcpdpWarningCode } from "@cosyte/ncpdp/profiles";
 * const code: NcpdpWarningCode = "NCPDP_TELECOM_UNKNOWN_REJECT_CODE";
 * ```
 */
export type NcpdpWarningCode = ScriptWarningCode | TelecomWarningCode;

/**
 * The bucket a quirk falls into when rendered by {@link NcpdpProfile.describe}.
 * Mirrors the roadmap's "what this profile relaxes / adds / requires" framing.
 *
 * - `relaxes` — the partner tolerates / emits a structural variation a strict
 *   baseline read would flag (e.g. a SCRIPT version stamp outside the explicitly
 *   supported set).
 * - `adds` — the partner emits extra spec-optional content (e.g. an additional
 *   Telecom response segment, a deeper reject-code taxonomy) a generic consumer
 *   might not expect.
 * - `requires` — the partner mandates a normally-situational element be present
 *   (e.g. a PBM that requires Person Code in the Insurance segment).
 *
 * @example
 * ```ts
 * import type { NcpdpProfileEffect } from "@cosyte/ncpdp/profiles";
 * const effect: NcpdpProfileEffect = "adds";
 * ```
 */
export type NcpdpProfileEffect = "relaxes" | "adds" | "requires";

/**
 * A single trading-partner convention captured by a profile. Every quirk is
 * fixture-grounded: `fixture` points at a real Tier-2 corpus file that
 * demonstrates the convention, and `sourceCategory` records where it is
 * documented. This is the locked hard rule — a quirk without a demonstrating
 * fixture is forbidden, enforced both by this required field and by the
 * accuracy test.
 *
 * @example
 * ```ts
 * import type { NcpdpProfileQuirk } from "@cosyte/ncpdp/profiles";
 * const quirk: NcpdpProfileQuirk = {
 *   id: "person-code-required",
 *   standard: "telecom",
 *   effect: "requires",
 *   summary: "Insurance segment carries a Person Code (303-C3) cardholder/dependent value.",
 *   fixture: "telecom/pbm-person-code.ncpdp",
 *   sourceCategory: "NCPDP Telecommunication vD.0 — Person Code (303-C3); PBM payer sheets",
 * };
 * ```
 */
export interface NcpdpProfileQuirk {
  /** Stable, kebab-case identifier — unique within a profile's quirk set. */
  readonly id: string;
  /** Which NCPDP standard the quirk (and its cited fixture) belongs to. */
  readonly standard: NcpdpStandard;
  /** Which `describe()` bucket this quirk renders into. */
  readonly effect: NcpdpProfileEffect;
  /** One-line human summary. NEVER contains PHI — describes structure only. */
  readonly summary: string;
  /**
   * Path to the Tier-2 fixture demonstrating the convention, relative to
   * `test/fixtures/` (e.g. `"telecom/pbm-person-code.ncpdp"`). REQUIRED — the
   * locked hard rule. The accuracy test parses this file and asserts the
   * claimed convention is present.
   */
  readonly fixture: string;
  /** Where the convention is documented (standard clause / companion guide). */
  readonly sourceCategory: string;
  /**
   * Warning codes this quirk leads a consumer to EXPECT when the convention is
   * present. Drives `partitionWarnings`. Often empty: the lenient parser
   * absorbs most conventions with zero warnings, and that "lossless, no warning"
   * outcome is itself the documented behavior.
   */
  readonly expectedWarnings?: readonly NcpdpWarningCode[];
}

/**
 * Structured `describe()` output — the "what this profile relaxes / adds /
 * requires" record published with the package. Returned as DATA (not a
 * formatted string) so downstream tooling — docs generators, the `pathways`
 * engine — can consume it programmatically.
 *
 * @example
 * ```ts
 * import { profiles } from "@cosyte/ncpdp/profiles";
 * const d = profiles.pbm.describe();
 * d.requires.map((q) => q.id);   // ["person-code-required"]
 * d.expectedWarnings;            // readonly NcpdpWarningCode[]
 * ```
 */
export interface NcpdpProfileDescription {
  readonly name: string;
  readonly description?: string;
  readonly lineage: readonly string[];
  /** Standards this profile's quirks touch (sorted, de-duplicated). */
  readonly standards: readonly NcpdpStandard[];
  readonly relaxes: readonly NcpdpProfileQuirk[];
  readonly adds: readonly NcpdpProfileQuirk[];
  readonly requires: readonly NcpdpProfileQuirk[];
  /** Sorted, de-duplicated union of every quirk's `expectedWarnings`. */
  readonly expectedWarnings: readonly NcpdpWarningCode[];
}

/**
 * A readonly, frozen profile produced by `defineProfile()`. Mirrors the locked
 * x12/hl7 shape (name / description / lineage) plus NCPDP's `standard`-tagged
 * `quirks` axis and a structured `describe()`.
 *
 * @example
 * ```ts
 * import { parseTelecom } from "@cosyte/ncpdp/telecom";
 * import { profiles } from "@cosyte/ncpdp/profiles";
 * const tx = parseTelecom(raw, { profile: profiles.pbm });
 * tx.profile?.name;          // "pbm"
 * tx.profile?.describe().requires.length;
 * ```
 */
export interface NcpdpProfile {
  readonly name: string;
  readonly description?: string;
  readonly lineage: readonly string[];
  readonly quirks: readonly NcpdpProfileQuirk[];
  readonly describe: () => NcpdpProfileDescription;
}

/**
 * Input accepted by `defineProfile()`. Every field except `name` is optional;
 * `extends` composes parent profiles (lineage + quirks merge) the same way the
 * x12/hl7 `extends` does.
 *
 * @example
 * ```ts
 * import { defineProfile, profiles, type NcpdpProfileSpec } from "@cosyte/ncpdp/profiles";
 * const spec: NcpdpProfileSpec = {
 *   name: "my-regional-pbm",
 *   extends: profiles.pbm,
 *   quirks: [
 *     {
 *       id: "reject-code-depth",
 *       standard: "telecom",
 *       effect: "adds",
 *       summary: "Returns reject codes beyond the modeled core set.",
 *       fixture: "telecom/pbm-reject-unknown.ncpdp",
 *       sourceCategory: "regional PBM payer sheet — reject-code taxonomy",
 *     },
 *   ],
 * };
 * const profile = defineProfile(spec);
 * ```
 */
export interface NcpdpProfileSpec {
  readonly name: string;
  readonly description?: string;
  readonly quirks?: readonly NcpdpProfileQuirk[];
  readonly extends?: NcpdpProfile | readonly NcpdpProfile[];
}
