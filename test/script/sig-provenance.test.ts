/**
 * Mechanical guard on the structured-SIG recognized-name vocabulary.
 *
 * Three things are checked here, and one thing deliberately is not.
 *
 *   - **Shape**: every shipped name carries a provenance record naming the
 *     artifact, its URL, an ISO retrieval date and the label quoted from it.
 *   - **Subset**: the shipped set is drawn from the names the previous release
 *     carried, each still mapped to the same component. A name may be REMOVED;
 *     adding one, re-spelling one, or moving one to a different component fails
 *     here. That direction is the safe one: a name that stops matching costs a
 *     component, a name that matches the wrong element costs a wrong dispense.
 *   - **Docs agreement**: the per-component name list the package publishes is
 *     the shipped one, and the names the package says it removed are exactly the
 *     ones it removed.
 *
 * What this file CANNOT check is whether a quoted label is really in the
 * artifact. That is a reading of a document, not a property of the code, so it
 * is a review obligation rather than a test: the labels were transcribed from
 * the committed copy of the field-label inventory, and the comment above
 * `SIG_NAME_PROVENANCE` in `src/script/sig.ts` records the retrieval, the
 * method, the negative control and the assumption. Do not read a green run here
 * as evidence that a label was verified.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SIG_COMPONENT_NAMES,
  SIG_COMPONENT_SLOTS,
  SIG_NAME_PROVENANCE,
  type SigNameProvenance,
} from "../../src/script/sig.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const specNotes = join(repoRoot, "docs-content", "spec-notes-structured-sig.md");

/**
 * The recognized-name vocabulary as the PREVIOUS release shipped it: fifteen
 * names across the ten component slots, transcribed from `COMPONENT_NAMES` and
 * `DOSE_QUANTITY_NAMES` at the commit this change starts from. It is written out
 * here rather than derived from the source, because a baseline derived from the
 * thing it constrains would agree with it forever.
 */
const BASELINE: Readonly<Record<string, string>> = {
  DoseDeliveryMethod: "doseDeliveryMethod",
  DoseQuantity: "dose",
  Dose: "dose",
  DoseUnitOfMeasure: "doseUnitOfMeasure",
  RouteOfAdministration: "route",
  Route: "route",
  SiteOfAdministration: "siteOfAdministration",
  Site: "siteOfAdministration",
  AdministrationTiming: "administrationTiming",
  TimingAndDuration: "administrationTiming",
  Frequency: "administrationTiming",
  Duration: "duration",
  Vehicle: "vehicle",
  Indication: "indication",
  MaximumDoseRestriction: "maximumDoseRestriction",
};

/** Every element name this release actually matches on, across all slots. */
const shippedNames: readonly string[] = SIG_COMPONENT_SLOTS.flatMap(
  (slot) => SIG_COMPONENT_NAMES[slot] as readonly string[],
);

/** The component each shipped name populates. */
const shippedComponentOf = new Map<string, string>(
  SIG_COMPONENT_SLOTS.flatMap((slot) =>
    (SIG_COMPONENT_NAMES[slot] as readonly string[]).map((name) => [name, slot] as const),
  ),
);

/**
 * Rows of the first markdown table under `heading` in the spec notes, each row
 * as its trimmed cells. The docs are the consumer-facing half of this contract,
 * so they are parsed rather than eyeballed.
 */
function tableRows(heading: string): string[][] {
  const md = readFileSync(specNotes, "utf8");
  const start = md.indexOf(heading);
  expect(start, `heading not found in the spec notes: ${heading}`).toBeGreaterThan(-1);
  const after = md.slice(start + heading.length);
  const rows: string[][] = [];
  let seenTable = false;
  for (const line of after.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      if (seenTable) break;
      continue;
    }
    seenTable = true;
    const cells = trimmed
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());
    if (cells.every((c) => /^-+$/.test(c))) continue;
    rows.push(cells);
  }
  return rows.slice(1);
}

/** Element names named in a cell as inline code spans. */
function namesIn(cell: string): string[] {
  return [...cell.matchAll(/`([A-Za-z]+)`/g)].map((m) => m[1] as string);
}

describe("structured SIG recognized names carry their provenance", () => {
  it("gives every shipped name an artifact, a URL, an ISO retrieval date and a quoted label", () => {
    expect(shippedNames.length).toBeGreaterThan(0);
    const records: Readonly<Record<string, SigNameProvenance | undefined>> = SIG_NAME_PROVENANCE;
    for (const name of shippedNames) {
      const record = records[name];
      expect(record, `no provenance record for the shipped name ${name}`).toBeDefined();
      if (record === undefined) continue;

      expect(record.label.trim(), `${name}: empty quoted label`).not.toBe("");
      expect(record.artifact.trim(), `${name}: empty artifact`).not.toBe("");
      expect(record.url, `${name}: URL is not a retrievable https address`).toMatch(
        /^https:\/\/\S+$/,
      );
      expect(record.retrieved, `${name}: retrieval date is not an ISO date`).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      );
      expect(record.component, `${name}: provenance names a different component`).toBe(
        shippedComponentOf.get(name),
      );
    }
  });

  it("carries no provenance record for a name it does not ship", () => {
    // A stale record would advertise evidence for a name nothing matches on,
    // which is the same defect as a stale doc: it describes a decode the code
    // does not perform.
    expect(Object.keys(SIG_NAME_PROVENANCE).sort()).toEqual([...shippedNames].sort());
  });

  it("ships only names the previous release carried, each on the same component", () => {
    for (const name of shippedNames) {
      expect(BASELINE[name], `${name} is not a name the previous release carried`).toBeDefined();
      expect(BASELINE[name], `${name} moved to a different component`).toBe(
        shippedComponentOf.get(name),
      );
    }
  });

  it("keeps every slot declared, so a removal narrows a slot and never deletes it", () => {
    expect(Object.keys(SIG_COMPONENT_NAMES).sort()).toEqual([...SIG_COMPONENT_SLOTS].sort());
  });

  it("documents exactly the names it ships, per component", () => {
    const documented = new Map<string, string[]>();
    for (const cells of tableRows("### Recognized element names, per component")) {
      const [slotCell, namesCell] = cells;
      expect(slotCell).toBeDefined();
      expect(namesCell).toBeDefined();
      const slot = namesIn(slotCell as string)[0];
      expect(slot, `unparseable component cell: ${slotCell as string}`).toBeDefined();
      documented.set(slot as string, namesIn(namesCell as string));
    }

    expect([...documented.keys()].sort()).toEqual([...SIG_COMPONENT_SLOTS].sort());
    for (const slot of SIG_COMPONENT_SLOTS) {
      expect(
        documented.get(slot),
        `${slot}: documented names disagree with the shipped set`,
      ).toEqual([...(SIG_COMPONENT_NAMES[slot] as readonly string[])]);
    }
  });

  it("documents every removed name as removed, and no shipped name as removed", () => {
    const removed = new Set(
      tableRows("### Element names this release removed").flatMap((cells) =>
        namesIn(cells[0] ?? ""),
      ),
    );
    const expected = new Set(Object.keys(BASELINE).filter((name) => !shippedComponentOf.has(name)));
    expect([...removed].sort()).toEqual([...expected].sort());
    for (const name of shippedNames) {
      expect(removed.has(name), `${name} is shipped but documented as removed`).toBe(false);
    }
  });
});
