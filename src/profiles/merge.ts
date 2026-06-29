/**
 * Pure merge helpers consumed by `defineProfile()` when `opts.extends` is
 * supplied. Every helper takes a `readonly parents[]` + a self value and
 * returns the merged result; none mutate input. Mirrors x12/hl7 merge
 * semantics: lineage flatten+dedupe (first occurrence wins), scalar last-wins,
 * and a quirk merge keyed by id where later layers (child) win on id collision
 * while non-colliding parent quirks survive additively.
 *
 * Post-merge re-validation is the CALLER's responsibility — these helpers are
 * pure reducers.
 *
 * @internal
 */

import type { NcpdpProfile, NcpdpProfileQuirk } from "./types.js";

/**
 * Normalise the `extends` input to a readonly array. Accepts a single profile
 * or an array; returns `[]` for `undefined`.
 *
 * @internal
 */
export function normaliseParents(
  ext: NcpdpProfile | readonly NcpdpProfile[] | undefined,
): readonly NcpdpProfile[] {
  if (ext === undefined) return [];
  // `Array.isArray` narrows to `any[]`, erasing the element type; the cast
  // restores it. The contrary branch is a single profile, not an array.
  if (Array.isArray(ext)) return ext as readonly NcpdpProfile[];
  return [ext as NcpdpProfile];
}

/**
 * Compute lineage: flatten parent lineages (or `[parent.name]` when a parent
 * has no lineage), append `selfName`, dedupe preserving first occurrence.
 *
 * @internal
 */
export function mergeLineage(
  parents: readonly NcpdpProfile[],
  selfName: string,
): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parents) {
    const parentLineage = p.lineage.length > 0 ? p.lineage : [p.name];
    for (const n of parentLineage) {
      if (!seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  if (!seen.has(selfName)) out.push(selfName);
  return Object.freeze(out);
}

/**
 * Merge quirks by id: iterate every parent in order (left-to-right) then self.
 * A later layer's quirk with the same id REPLACES the earlier one but keeps its
 * first-seen position, so a child can specialise an inherited quirk (e.g.
 * re-source it to its own payer sheet) without reordering the set.
 * Non-colliding parent quirks survive additively.
 *
 * @internal
 */
export function mergeQuirks(
  parents: readonly NcpdpProfile[],
  selfQuirks: readonly NcpdpProfileQuirk[],
): readonly NcpdpProfileQuirk[] {
  const order: string[] = [];
  const byId = new Map<string, NcpdpProfileQuirk>();
  const layer = (quirks: readonly NcpdpProfileQuirk[]): void => {
    for (const q of quirks) {
      if (!byId.has(q.id)) order.push(q.id);
      byId.set(q.id, q); // later layers overwrite earlier
    }
  };
  for (const p of parents) layer(p.quirks);
  layer(selfQuirks);
  return Object.freeze(order.map((id) => byId.get(id) as NcpdpProfileQuirk));
}

/**
 * Merge the `description` scalar: child value wins when provided; otherwise the
 * LAST parent with a non-undefined description.
 *
 * @internal
 */
export function mergeDescription(
  parents: readonly NcpdpProfile[],
  selfValue: string | undefined,
): string | undefined {
  if (selfValue !== undefined) return selfValue;
  for (let i = parents.length - 1; i >= 0; i--) {
    const v = parents[i]?.description;
    if (v !== undefined) return v;
  }
  return undefined;
}
