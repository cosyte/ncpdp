/**
 * NCPDP Telecommunication vD.0 Compound segment (segment id `10`) read.
 *
 * A compound claim lists **every** ingredient of a mixed preparation — each with
 * its own product id, quantity, and (optionally) cost. The single safety
 * invariant of this module is that **no ingredient is ever dropped or merged**: a
 * compound with a missing ingredient is, clinically, a different (wrong)
 * medication. The segment repeats one set of ingredient fields per component;
 * this splits at each ingredient boundary and surfaces them all in wire order.
 *
 * Quantities use the implied 3-place decimal (via {@link telecomQuantity}) and
 * costs the implied 2-place decimal (via {@link telecomMoney}); neither is ever
 * parsed through a float. Qualifier meanings are our own short labels — no
 * redistributed NCPDP prose.
 */

import { PRODUCT_QUALIFIER_MEANINGS, telecomQuantity, type TelecomQuantity } from "./claim.js";
import { telecomMoney, type TelecomMoney } from "./money.js";
import { telecomPosition } from "./position.js";
import { findSegment, fieldValue, type TelecomSegment } from "./tokenize.js";
import { telecomWarning, TELECOM_WARNING_CODES, type NcpdpTelecomWarning } from "./warnings.js";
import type { TelecomTransaction } from "./parse.js";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Segment Identification (111-AM) code for the Compound segment. */
const COMPOUND_SEGMENT = "10";

/** Compound Product ID Qualifier (488-RE) — names the code system of the ingredient id. */
const F_PRODUCT_QUALIFIER = "RE";
/** Compound Product ID (489-TE) — the ingredient's product id (e.g. an NDC). */
const F_PRODUCT_ID = "TE";
/** Compound Ingredient Quantity (448-ED) — implied 3-place decimal. */
const F_QUANTITY = "ED";
/** Compound Ingredient Drug Cost (449-EE) — implied 2-place decimal money. */
const F_DRUG_COST = "EE";
/** Compound Ingredient Basis of Cost Determination (490-UE), verbatim. */
const F_BASIS_OF_COST = "UE";
/** Compound Dosage Form Description Code (450-EF), verbatim. */
const F_DOSAGE_FORM = "EF";
/** Compound Dispensing Unit Form Indicator (451-EG), verbatim. */
const F_DISPENSING_UNIT = "EG";
/** Compound Ingredient Component Count (447-EC), verbatim declared count. */
const F_COMPONENT_COUNT = "EC";

/** Field ids that begin a new ingredient occurrence within the Compound segment. */
const INGREDIENT_ANCHORS: ReadonlySet<string> = new Set([F_PRODUCT_QUALIFIER, F_PRODUCT_ID]);

/**
 * One ingredient of a compound preparation, preserved verbatim. The product id
 * names the substance; its qualifier names the id's code system. Quantity and
 * cost are decimal-safe (never float). Absent fields are simply omitted — a
 * missing field is `undefined`, never a guess.
 */
export interface TelecomCompoundIngredient {
  /** Compound Product ID (489-TE), verbatim — e.g. an 11-digit NDC. */
  readonly productId: string;
  /** Compound Product ID Qualifier (488-RE), verbatim. */
  readonly productIdQualifier: string;
  /** Paraphrased qualifier meaning when recognized (e.g. `"NDC"`). */
  readonly qualifierMeaning?: string;
  /** Compound Ingredient Quantity (448-ED) with its implied 3-place decimal. */
  readonly quantity?: TelecomQuantity;
  /** Compound Ingredient Drug Cost (449-EE), decimal-safe, when present. */
  readonly drugCost?: TelecomMoney;
  /** Compound Ingredient Basis of Cost Determination (490-UE), verbatim. */
  readonly basisOfCostDetermination?: string;
}

/**
 * The Compound segment (10) view: the preparation-level descriptors plus every
 * ingredient in wire order. {@link declaredIngredientCount} is the count the
 * sender claimed (447-EC); compare it against `ingredients.length` to detect a
 * truncated compound — the parser also raises
 * `NCPDP_TELECOM_COMPOUND_COUNT_MISMATCH` when the two disagree.
 */
export interface TelecomCompound {
  /** Compound Dosage Form Description Code (450-EF), verbatim, when present. */
  readonly dosageFormCode?: string;
  /** Compound Dispensing Unit Form Indicator (451-EG), verbatim, when present. */
  readonly dispensingUnitFormIndicator?: string;
  /** Compound Ingredient Component Count (447-EC) the sender declared, verbatim. */
  readonly declaredIngredientCount?: string;
  /** Every ingredient surfaced in wire order — never dropped or merged. */
  readonly ingredients: readonly TelecomCompoundIngredient[];
}

function finishIngredient(draft: Mutable<TelecomCompoundIngredient>): TelecomCompoundIngredient {
  const meaning = PRODUCT_QUALIFIER_MEANINGS.get(draft.productIdQualifier);
  if (meaning !== undefined) draft.qualifierMeaning = meaning;
  return Object.freeze(draft);
}

/**
 * Split a Compound segment's fields into one ingredient per component. An
 * ingredient begins at the first Product ID Qualifier (488-RE) or Product ID
 * (489-TE) seen after the previous one, so the descriptors that precede the first
 * ingredient (dosage form, component count) are not mistaken for ingredient data.
 *
 * @param seg - The Compound (10) segment.
 * @returns Every ingredient in wire order.
 */
function readIngredients(seg: TelecomSegment): readonly TelecomCompoundIngredient[] {
  const ingredients: TelecomCompoundIngredient[] = [];
  let current: Mutable<TelecomCompoundIngredient> | undefined;

  const flush = (): void => {
    if (current !== undefined) ingredients.push(finishIngredient(current));
  };

  for (const field of seg.fields) {
    const startsNew =
      INGREDIENT_ANCHORS.has(field.id) &&
      (current === undefined ||
        (field.id === F_PRODUCT_QUALIFIER && current.productIdQualifier !== "") ||
        (field.id === F_PRODUCT_ID && current.productId !== ""));
    if (startsNew) {
      flush();
      current = { productId: "", productIdQualifier: "" };
    }
    if (current === undefined) continue;
    switch (field.id) {
      case F_PRODUCT_QUALIFIER:
        current.productIdQualifier = field.value;
        break;
      case F_PRODUCT_ID:
        current.productId = field.value;
        break;
      case F_QUANTITY:
        current.quantity = telecomQuantity(field.value);
        break;
      case F_DRUG_COST:
        current.drugCost = telecomMoney(field.value);
        break;
      case F_BASIS_OF_COST:
        current.basisOfCostDetermination = field.value;
        break;
      default:
        break;
    }
  }
  flush();
  return Object.freeze(ingredients);
}

/**
 * Build the Compound (10) view over a parsed Telecom transaction. Returns
 * `undefined` when no Compound segment is present. Every ingredient is surfaced
 * in wire order, none dropped — compare {@link TelecomCompound.declaredIngredientCount}
 * with `ingredients.length` (or watch for `NCPDP_TELECOM_COMPOUND_COUNT_MISMATCH`)
 * to detect a truncated compound.
 *
 * @param transaction - A transaction from {@link parseTelecom}.
 * @returns The compound view, or `undefined` when there is no Compound segment.
 *
 * @example
 * ```ts
 * const c = compound(parseTelecom(rawCompoundClaim));
 * c?.ingredients.length;          // number of ingredients (none dropped)
 * c?.ingredients[0]?.productId;   // the first ingredient's NDC
 * ```
 */
export function compound(transaction: TelecomTransaction): TelecomCompound | undefined {
  const seg = findSegment(transaction.segments, COMPOUND_SEGMENT);
  if (seg === undefined) return undefined;

  const out: Mutable<TelecomCompound> = { ingredients: readIngredients(seg) };
  const dosage = fieldValue(seg, F_DOSAGE_FORM);
  if (dosage !== undefined) out.dosageFormCode = dosage;
  const unit = fieldValue(seg, F_DISPENSING_UNIT);
  if (unit !== undefined) out.dispensingUnitFormIndicator = unit;
  const count = fieldValue(seg, F_COMPONENT_COUNT);
  if (count !== undefined) out.declaredIngredientCount = count;
  return Object.freeze(out);
}

/**
 * Raise `NCPDP_TELECOM_COMPOUND_COUNT_MISMATCH` when a Compound segment declares
 * an ingredient component count (447-EC) that disagrees with the number of
 * ingredient occurrences decoded. Called on the request path so the signal lives
 * on `transaction.warnings`. No ingredient is dropped either way.
 *
 * @param segments - The decoded request segments.
 * @param warnings - The parse warning sink.
 *
 * @example
 * ```ts
 * const warnings: NcpdpTelecomWarning[] = [];
 * collectCompoundWarnings(transaction.segments, warnings);
 * ```
 */
export function collectCompoundWarnings(
  segments: readonly TelecomSegment[],
  warnings: NcpdpTelecomWarning[],
): void {
  const seg = findSegment(segments, COMPOUND_SEGMENT);
  if (seg === undefined) return;

  const declaredRaw = fieldValue(seg, F_COMPONENT_COUNT);
  if (declaredRaw === undefined) return;
  const declared = Number.parseInt(declaredRaw, 10);
  if (!Number.isFinite(declared)) return;

  const actual = readIngredients(seg).length;
  if (declared !== actual) {
    warnings.push(
      telecomWarning(
        TELECOM_WARNING_CODES.COMPOUND_COUNT_MISMATCH,
        `Compound declared ${declared} ingredient(s) but ${actual} were decoded; all decoded ingredients are preserved verbatim.`,
        telecomPosition(seg.byteOffset, F_COMPONENT_COUNT),
      ),
    );
  }
}
