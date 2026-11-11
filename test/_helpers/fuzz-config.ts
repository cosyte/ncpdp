/**
 * The knobs of the property and fuzz layer, the runner every test under `test/property/` goes
 * through, and the per-case contract the fuzz targets check.
 *
 * Every property runs through {@link checkProperty}, and every fuzz target through
 * {@link checkFuzzTarget}, on the run options of `@cosyte/test-utils`:
 *
 * - On a pull request (`pnpm test`) each property runs its own count: 100 cases, or more where the
 *   test names more.
 * - `COSYTE_PROPERTY_RUNS` sets the depth of every property in the run, over any test's own count.
 *   The nightly properties run (`.github/workflows/nightly-properties.yml`) sets it to 10,000.
 * - A failure prints what failed and a line `Replay exactly: COSYTE_PROPERTY_SEED=<seed>
 *   COSYTE_PROPERTY_PATH=<path>`. Set the two and run `pnpm fuzz` to get the same case, already
 *   shrunk. The nightly job records each such line in its summary.
 *
 * The nightly fuzz run (`.github/workflows/nightly-fuzz.yml`, which calls the shared
 * `nightly-fuzz.yml`) runs `pnpm fuzz` with these set, and the fuzz targets read them, so each night
 * explores a different slice of the input space:
 *
 * - `NCPDP_FUZZ_SEED`: the fast-check seed, an integer. The nightly passes its run id, so the run
 *   that found something names the seed that replays it. `COSYTE_PROPERTY_SEED` wins over it.
 * - `NCPDP_FUZZ_SECONDS`: a time budget per target. When set, a target generates inputs until the
 *   budget is spent instead of stopping at its run count.
 * - `NCPDP_FUZZ_RUNS`: a multiplier on each target's own run count, for a run of a fixed size.
 *
 * A fuzz value that is not a whole number is ignored, so a malformed variable can never make a run
 * smaller than the committed one or silently change the seed. A malformed `COSYTE_PROPERTY_*`
 * value throws, as `@cosyte/test-utils` decides: a nightly job that typed its depth wrong must not
 * quietly run the pull-request depth.
 *
 * This module lives under `test/_helpers/`, not `test/property/`: every tracked module under
 * `test/property/` must be a selected test (`scripts/check-test-selection.ts`).
 *
 * @module
 */

import fc from "fast-check";
import { DEFAULT_NUM_RUNS, propertyFailureMessage, resolvePropertyRun } from "@cosyte/test-utils";

/** The environment a run reads. */
type Env = Readonly<Record<string, string | undefined>>;

/** A whole number from the environment, or `undefined` when it is unset or not one. */
function integerFromEnv(env: Env, name: string): number | undefined {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : undefined;
}

/** A positive whole number from the environment, or `undefined`. */
function positiveFromEnv(env: Env, name: string): number | undefined {
  const value = integerFromEnv(env, name);
  return value !== undefined && value > 0 ? value : undefined;
}

/** What the fuzz variables ask of a run; a property that is not a fuzz target reads none. */
interface FuzzSettings {
  readonly seed: number | undefined;
  readonly seconds: number | undefined;
  readonly multiplier: number;
}

const NO_FUZZ: FuzzSettings = { seed: undefined, seconds: undefined, multiplier: 1 };

function fuzzSettings(env: Env): FuzzSettings {
  return {
    // Any whole number: fast-check folds a seed to 32 bits and prints the folded value, which can
    // be negative, and that value replays too.
    seed: integerFromEnv(env, "NCPDP_FUZZ_SEED"),
    seconds: positiveFromEnv(env, "NCPDP_FUZZ_SECONDS"),
    multiplier: positiveFromEnv(env, "NCPDP_FUZZ_RUNS") ?? 1,
  };
}

/** Run a property under these fuzz settings; throw a replayable error on its first counterexample. */
function check<Ts>(
  name: string,
  property: fc.IProperty<Ts>,
  baseRuns: number,
  env: Env,
  fuzz: FuzzSettings,
): void {
  const numRuns = baseRuns * fuzz.multiplier;
  const run = resolvePropertyRun(
    fuzz.seed === undefined ? { numRuns } : { numRuns, seed: fuzz.seed },
    env,
  );
  const size: fc.Parameters<Ts> =
    fuzz.seconds === undefined
      ? { numRuns: run.numRuns }
      : { numRuns: Number.MAX_SAFE_INTEGER, interruptAfterTimeLimit: fuzz.seconds * 1000 };
  const details = fc.check(property, {
    ...size,
    ...(run.seed === undefined ? {} : { seed: run.seed }),
    ...(run.path === undefined ? {} : { path: run.path, endOnFailure: true }),
    includeErrorInReport: true,
  });
  if (!details.failed) return;
  throw new Error(propertyFailureMessage(name, details), { cause: details.errorInstance });
}

/** The Vitest timeout for a property under these fuzz settings. */
function timeout(baseMs: number, baseRuns: number, env: Env, fuzz: FuzzSettings): number {
  if (fuzz.seconds !== undefined) return fuzz.seconds * 1000 + 120_000;
  const runs = resolvePropertyRun({ numRuns: baseRuns * fuzz.multiplier }, env).numRuns;
  return Math.max(baseMs, Math.ceil((baseMs * runs) / baseRuns));
}

/**
 * Run a property and throw a replayable error on its first counterexample. It reads the
 * `COSYTE_PROPERTY_*` variables only; a fuzz target goes through {@link checkFuzzTarget}.
 *
 * @param name What the property states; it leads the failure message.
 * @param property The fast-check property.
 * @param baseRuns The cases a pull request runs, 100 unless the test needs more.
 * @param env The environment; `process.env` unless a test of this runner passes its own.
 */
export function checkProperty<Ts>(
  name: string,
  property: fc.IProperty<Ts>,
  baseRuns: number = DEFAULT_NUM_RUNS,
  env: Env = process.env,
): void {
  check(name, property, baseRuns, env, NO_FUZZ);
}

/**
 * Run a fuzz target: {@link checkProperty}, with the nightly fuzz run's `NCPDP_FUZZ_*` variables
 * read as well, so a target can run for a time budget, from a given seed, or a multiple of its
 * count.
 *
 * @param name What the target holds; it leads the failure message.
 * @param property The fast-check property.
 * @param baseRuns The cases a pull request runs.
 * @param env The environment; `process.env` unless a test of this runner passes its own.
 */
export function checkFuzzTarget<Ts>(
  name: string,
  property: fc.IProperty<Ts>,
  baseRuns: number = DEFAULT_NUM_RUNS,
  env: Env = process.env,
): void {
  check(name, property, baseRuns, env, fuzzSettings(env));
}

/**
 * The Vitest timeout for one property test. A synchronous property cannot be interrupted by this
 * timer, only judged after it returns, so it is sized to the run rather than used as a hang
 * detector: the per-case budget in {@link withinBudget} is the hang detector for a fuzz target. It
 * grows with the depth the run resolves, so a nightly run of 10,000 cases is not cut off by the
 * budget of 100.
 *
 * @param baseMs The budget at the test's own count.
 * @param baseRuns The test's own count, as passed to {@link checkProperty}.
 * @param env The environment; `process.env` unless a test of this runner passes its own.
 */
export function propertyTimeout(
  baseMs: number,
  baseRuns: number = DEFAULT_NUM_RUNS,
  env: Env = process.env,
): number {
  return timeout(baseMs, baseRuns, env, NO_FUZZ);
}

/**
 * The Vitest timeout for one fuzz target, as {@link propertyTimeout} with the `NCPDP_FUZZ_*`
 * variables read: a time budget gets that budget and two minutes more.
 *
 * @param baseMs The budget at the target's own count.
 * @param baseRuns The target's own count, as passed to {@link checkFuzzTarget}.
 * @param env The environment; `process.env` unless a test of this runner passes its own.
 */
export function fuzzTimeout(baseMs: number, baseRuns: number, env: Env = process.env): number {
  return timeout(baseMs, baseRuns, env, fuzzSettings(env));
}

/**
 * The CPU-time budget for one case, in milliseconds: a fixed floor for a garbage collection, plus
 * one millisecond per 64 bytes of input. A linear pass over the largest input a target builds
 * takes a few milliseconds, so a case over this budget is a hang or a super-linear path. It is CPU
 * time, not wall-clock time: on a busy machine a case waits for a core without using one, and that
 * wait is not the code's. Vitest runs each worker as its own process here (the `forks` pool), so
 * the process's CPU time is this case's.
 */
export function caseBudgetMs(inputLength: number): number {
  return 250 + inputLength / 64;
}

/**
 * How much the heap and the `ArrayBuffer` store may grow during one case. The inputs here are a
 * few KiB at most, and nothing on these paths legitimately turns that into more than a few MiB, so
 * growth past this is a runaway allocation.
 */
export const CASE_ALLOCATION_BYTES = 256 * 1024 * 1024;

/** Heap in use plus the memory held by `ArrayBuffer`s. */
function heapAndBuffers(): number {
  const usage = process.memoryUsage();
  return usage.heapUsed + usage.arrayBuffers;
}

/** CPU time this process has used, user and system, in milliseconds. */
function cpuMs(): number {
  const { user, system } = process.cpuUsage();
  return (user + system) / 1000;
}

/** The first bytes of an input as hex, so a failure message names the case. */
export function preview(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  const head = bytes.subarray(0, 64).toString("hex");
  return bytes.length > 64 ? `${head}... (${String(bytes.length)} bytes)` : head;
}

/**
 * How many times a case runs before an overrun fails it. A garbage collection can land in one run
 * of a case; a hang or a super-linear path is over budget on every run. Cases are deterministic,
 * so running one again is the same case.
 */
const CONFIRMING_RUNS = 3;

/**
 * Run one fuzz case and hold it to the resource half of the contract: it returns within
 * {@link caseBudgetMs} and grows memory by no more than {@link CASE_ALLOCATION_BYTES}, on its
 * best of {@link CONFIRMING_RUNS} runs. The behavioural half (which throws are sanctioned) is the
 * caller's `run`, which must not keep state between runs.
 */
export function withinBudget(input: Uint8Array | string, run: () => void): void {
  const budget = caseBudgetMs(input.length);
  let fastest = Number.POSITIVE_INFINITY;
  let leanest = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < CONFIRMING_RUNS; attempt++) {
    const before = heapAndBuffers();
    const started = cpuMs();
    run();
    fastest = Math.min(fastest, cpuMs() - started);
    leanest = Math.min(leanest, heapAndBuffers() - before);
    if (fastest <= budget && leanest <= CASE_ALLOCATION_BYTES) return;
  }
  if (fastest > budget) {
    throw new Error(
      `fuzz: the case used ${fastest.toFixed(1)} ms of CPU at best of ${String(CONFIRMING_RUNS)} runs, over its ${budget.toFixed(0)} ms budget (a hang or a super-linear path): ${preview(input)}`,
    );
  }
  throw new Error(
    `fuzz: the case grew the heap and buffers by ${(leanest / 1048576).toFixed(1)} MiB at best of ${String(CONFIRMING_RUNS)} runs (a runaway allocation): ${preview(input)}`,
  );
}
