/**
 * Shared knob for the byte-flip / never-throw **fuzz targets** so the nightly
 * fuzz workflow can amplify iteration counts without changing the per-commit
 * `pnpm test` run.
 *
 * - Under normal `pnpm test` (and CI's `ci` job), `NCPDP_FUZZ_RUNS` is unset,
 *   the multiplier is **1**, and every fuzz target runs its committed base
 *   iteration count. Behaviour is byte-identical to a bare `{ numRuns: base }`.
 * - The nightly `fuzz.yml` workflow sets `NCPDP_FUZZ_RUNS` (e.g. `20`) to run
 *   20× the base iterations — the deep search that would make the per-commit
 *   run slow.
 *
 * No seed pinning: fast-check derives its default seed per run and **prints the
 * failing seed + counterexample on any failure**, so a nightly finding is
 * already replayable (re-run with `fc.assert(..., { seed: <printed> })`), and
 * the per-commit run keeps exploring fresh inputs every push.
 *
 * Only the true fuzz targets (hostile-input / entity-injection never-throw
 * properties) read this — the equality/round-trip property tests keep their
 * fixed counts because more runs add cost without added assurance.
 */

/**
 * Multiply a fuzz target's base iteration count by the `NCPDP_FUZZ_RUNS`
 * environment multiplier (default `1`, floored at `1`). Non-numeric or `< 1`
 * values fall back to `1` so a malformed env var can never *reduce* coverage
 * below the committed baseline.
 *
 * @example
 * ```ts
 * // base 200 locally; 4_000 under `NCPDP_FUZZ_RUNS=20`
 * fc.assert(fc.property(arb, prop), { numRuns: fuzzRuns(200) });
 * ```
 */
export function fuzzRuns(base: number): number {
  const raw = process.env["NCPDP_FUZZ_RUNS"];
  if (raw === undefined) return base;
  const multiplier = Number(raw);
  if (!Number.isFinite(multiplier) || multiplier < 1) return base;
  return Math.floor(base * multiplier);
}
