#!/usr/bin/env tsx
/**
 * scripts/record-public-surface.ts: rewrite `test/public-surface.json` from the current tree.
 *
 * Run it with `pnpm surface:record`, and run it ON PURPOSE. `test/public-surface.test.ts` compares
 * the recorded surface against the compiler's answer in both directions, so an export that is
 * added, removed, renamed or changed in kind reds until this file is re-run and the result
 * committed. That is the intended workflow, not a way around the gate: the gate does not exist to
 * make the surface immovable, it exists to make it impossible to move the surface without the
 * exports moving in the diff where a reviewer sees them.
 *
 * SO READ THE DIFF THIS PRODUCES BEFORE YOU COMMIT IT. On the `0.x` ladder the question a removed
 * line asks is not "does the build pass" but "does anything still depend on this, and does the
 * changeset say so". A removal or a rename here is a break candidate and belongs in the release
 * audit; an addition is a feature and earns a `minor` under the rule in `.changeset/README.md`.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { readPublicSurface, ROOT, serializeSurface } from "./public-surface.js";

const target = join(ROOT, "test", "public-surface.json");
const surface = readPublicSurface();

writeFileSync(target, serializeSurface(surface));

const counts = Object.entries(surface)
  .map(([specifier, entries]) => `${specifier}: ${String(entries.length)}`)
  .join(", ");
process.stdout.write(`record-public-surface: wrote test/public-surface.json (${counts})\n`);
