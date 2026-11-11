/**
 * The scaling gates for `parseScript` and `parseTelecom`, from `@cosyte/test-utils/perf`, run by
 * `pnpm test:perf` and never under coverage (see `vitest.perf.config.ts`).
 *
 * Each asks one question: does parsing cost grow faster than the input? On the count axis, 4 times
 * the messages; on the size axis, messages 4 times longer: a medication history with 4 times the
 * entries, a Telecom transmission with 4 times the claims. Each ratio must stay inside the band the
 * shared contract fixes. It does not see a constant-factor slowdown: a parser 10% slower everywhere
 * passes, and always will. The base against head comparison on a pull request
 * (`bench/ncpdp.bench.mjs`) is the instrument for that.
 *
 * Each self-check proves its fixtures are large enough for the gate to fail: the same parse reached
 * quadratically (every entry or claim found by scanning from the start of the message) must clear
 * the ceiling at exactly these sizes. Every input is synthetic, built in code by the bench's own
 * `bench/shapes.mjs`.
 */

import {
  assertScalingGateFires,
  scalingGate,
  type ScalingGateOptions,
} from "@cosyte/test-utils/perf";
import { describe, expect, it } from "vitest";

import { b1Claim, b1Wide, medicationHistory, newRx } from "../../bench/shapes.mjs";
import {
  parseScript,
  parseTelecom,
  type ScriptMessage,
  type TelecomTransaction,
} from "../../src/index.js";

/**
 * The start of the `k`-th `marker`, found by reading the text from its first character, one
 * character at a time. Done for every marker, that is quadratic in the marker count.
 */
function markerStart(raw: string, marker: string, k: number): number {
  const first = marker.charCodeAt(0);
  let seen = -1;
  for (let at = 0; at < raw.length; at++) {
    if (raw.charCodeAt(at) === first && raw.startsWith(marker, at)) {
      seen++;
      if (seen === k) return at;
    }
  }
  return -1;
}

/**
 * The text cut at every `marker`, each found by scanning from the start, and put back together. It
 * is the same text, reached the wrong way.
 */
function rejoinQuadratic(raw: string, marker: string): string {
  const pieces: string[] = [];
  let from = 0;
  for (let k = 0; ; k++) {
    const at = markerStart(raw, marker, k);
    if (at === -1) break;
    pieces.push(raw.slice(from, at));
    from = at;
  }
  pieces.push(raw.slice(from));
  return pieces.join("");
}

/**
 * Both phases, and the self-check, use exactly these fixtures. Each base phase has to take at
 * least the gate's minimum phase time on a runner; the parses got faster, so the fixtures grew
 * with them (from 100 NewRx, 50 history entries, 500 claims and 200 wide claims).
 */
const script: ScalingGateOptions<string, ScriptMessage> = {
  name: "@cosyte/ncpdp parseScript",
  parse: (raw) => parseScript(raw),
  weigh: (m) => m.warnings.length + 1,
  count: { n: 250, generate: (i) => newRx(i) },
  size: { inputs: 4, size: 150, generate: (i, size) => medicationHistory(i, size) },
};

const telecom: ScalingGateOptions<string, TelecomTransaction> = {
  name: "@cosyte/ncpdp parseTelecom",
  parse: (raw) => parseTelecom(raw),
  weigh: (t) => t.transactions.length + t.warnings.length,
  count: { n: 1250, generate: (i) => b1Claim(i) },
  size: { inputs: 4, size: 400, generate: (i, size) => b1Wide(i, size) },
};

describe("the scaling gate: parseScript", () => {
  it("has not acquired a complexity regression on either axis", () => {
    const report = scalingGate(script);
    // A skip is not a pass: a gate that could not measure says so here, rather than reading green.
    expect(report.count.status, report.count.diagnostic).toBe("measured");
    expect(report.size.status, report.size.diagnostic).toBe("measured");
  });

  it("has fixtures large enough for that gate to fail", () => {
    const report = assertScalingGateFires(script, {
      regressedParse: (raw) => parseScript(rejoinQuadratic(raw, "<MedicationDispensed>")),
      equals: (a, b) =>
        a.body.kind === b.body.kind && JSON.stringify(a.warnings) === JSON.stringify(b.warnings),
    });
    expect(report.margin).toBeGreaterThan(1);
  });
});

describe("the scaling gate: parseTelecom", () => {
  it("has not acquired a complexity regression on either axis", () => {
    const report = scalingGate(telecom);
    expect(report.count.status, report.count.diagnostic).toBe("measured");
    expect(report.size.status, report.size.diagnostic).toBe("measured");
  });

  it("has fixtures large enough for that gate to fail", () => {
    const report = assertScalingGateFires(telecom, {
      regressedParse: (raw) => parseTelecom(rejoinQuadratic(raw, "\x1d")),
      // The serializer refuses a transmission of more than one transaction, so the two models are
      // compared whole: the same text gives the same segments, offsets and warnings.
      equals: (a, b) =>
        JSON.stringify(a.transactions) === JSON.stringify(b.transactions) &&
        JSON.stringify(a.warnings) === JSON.stringify(b.warnings),
    });
    expect(report.margin).toBeGreaterThan(1);
  });
});
