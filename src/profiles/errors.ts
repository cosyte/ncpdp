/**
 * Error taxonomy for the `@cosyte/ncpdp` profile subsystem (Phase 9).
 *
 * `NcpdpProfileError` is thrown by `defineProfile()` when a profile definition
 * is structurally invalid — a bad/missing name, an unknown option key, a bad
 * `standard`, or a quirk that violates the locked hard rule (missing `fixture`,
 * unknown `effect`, an `expectedWarnings` code outside the combined registry).
 * It is a definition-time error (developer mistake), distinct from the runtime
 * `NcpdpScriptParseError` / `NcpdpTelecomParseError` thrown on corrupt input.
 */

/**
 * Thrown by `defineProfile()` and profile-validation code when a profile
 * definition is structurally invalid. Carries the offending profile name (when
 * known) so consumers can pinpoint which definition failed.
 *
 * @example
 * ```ts
 * import { defineProfile, NcpdpProfileError } from "@cosyte/ncpdp/profiles";
 * try {
 *   defineProfile({ name: "" });
 * } catch (err) {
 *   if (err instanceof NcpdpProfileError) {
 *     console.error(err.message, err.profileName);
 *   }
 * }
 * ```
 */
export class NcpdpProfileError extends Error {
  public readonly profileName: string | undefined;

  /**
   * Construct a new `NcpdpProfileError`. `profileName` is optional so the name
   * validator can throw before a usable name is available.
   *
   * @internal
   */
  public constructor(message: string, profileName?: string) {
    super(message);
    this.name = "NcpdpProfileError";
    this.profileName = profileName;
  }
}
