/**
 * Output equivalence: the library observes the same as it did before its allocation and import work.
 *
 * The Telecom tokenizer and views, the SCRIPT XML loader and the writers were rewritten to allocate
 * less and load less, with the promise that nothing a caller can see moves: every parse result,
 * warning, typed read, built and serialized text, and error. `test/_helpers/output-corpus.ts`
 * records all of that for each input of a synthetic corpus and hashes it; the digests in
 * `test/fixtures/equivalence/output-digests.json` were captured from the source before the work
 * (`NCPDP_CAPTURE_DIGESTS=1 pnpm exec vitest run test/output-equivalence.test.ts` writes them).
 * This test holds the current source to every one.
 *
 * A digest that moves is a behaviour change. Recapture only for a change that means to move what
 * a caller sees, and say so in its pull request.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  newRxBuilds,
  observeNewRxBuild,
  observeResponseBuild,
  observeScript,
  observeTelecom,
  observeTelecomBuild,
  responseBuilds,
  scriptInputs,
  telecomBuilds,
  telecomInputs,
} from "./_helpers/output-corpus.js";

const DIGESTS = fileURLToPath(
  new URL("./fixtures/equivalence/output-digests.json", import.meta.url),
);

const capture = process.env["NCPDP_CAPTURE_DIGESTS"] === "1";

/** Every digest of the corpus, keyed by its label, in corpus order. */
function digests(): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (label: string, digest: string): void => {
    if (Object.hasOwn(out, label)) throw new Error(`duplicate corpus label ${label}`);
    out[label] = digest;
  };
  for (const input of scriptInputs()) put(`script:${input.label}`, observeScript(input.text));
  for (const input of telecomInputs()) put(`telecom:${input.label}`, observeTelecom(input.text));
  for (const build of newRxBuilds())
    put(`build:newRx:${build.label}`, observeNewRxBuild(build.input));
  for (const build of responseBuilds()) {
    put(`build:response:${build.label}`, observeResponseBuild(build.input));
  }
  for (const build of telecomBuilds()) {
    put(`build:telecom:${build.label}`, observeTelecomBuild(build.input));
  }
  return out;
}

describe("output equivalence against the digests captured before the allocation work", () => {
  it("observes every input of the corpus exactly as before", () => {
    const head = digests();
    if (capture) {
      writeFileSync(DIGESTS, `${JSON.stringify(head, null, 2)}\n`);
      return;
    }
    const base = JSON.parse(readFileSync(DIGESTS, "utf8")) as Record<string, string>;
    expect(Object.keys(head)).toEqual(Object.keys(base));
    const moved = Object.keys(base).filter((label) => head[label] !== base[label]);
    expect(moved).toEqual([]);
    // The corpus is the size the pull request reports, so a shrunken corpus cannot pass quietly.
    expect(Object.keys(base).length).toBeGreaterThan(1000);
  }, 120_000);
});
