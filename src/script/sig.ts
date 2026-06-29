import { codedValue, type CodedValue } from "../common/code-system.js";
import { joinPath, scriptPosition } from "../common/position.js";
import {
  scriptWarning,
  SCRIPT_WARNING_CODES,
  type NcpdpScriptWarning,
} from "../common/warnings.js";
import { attrValue, childText, firstChild, firstDescendantNamed } from "./nav.js";
import type { XmlElement } from "./xml-load.js";

/**
 * Where a decoded structured-SIG field's value came from.
 *
 * - `"coded"` — the structured element carried a code (with an optional system
 *   qualifier); a {@link SigField.code} is present.
 * - `"derived"` — a value was read from the structured element but it was not
 *   coded; only {@link SigField.text} is present.
 * - `"absent"` — the structured element was missing or empty; neither a code nor
 *   text could be read. The field is **not** inferred from the free text.
 */
export type SigFieldProvenance = "coded" | "derived" | "absent";

/**
 * One decoded component of a structured SIG, always carrying its
 * {@link SigFieldProvenance} so a consumer can tell, per field, whether the value
 * was coded, derived from uncoded structure, or absent. A `"coded"` field's code
 * keeps its source qualifier verbatim (SNOMED CT / NCI Thesaurus / etc.) so the
 * provenance is auditable even when our qualifier table lags the spec.
 */
export interface SigField {
  /** Whether this field was coded, derived from uncoded structure, or absent. */
  readonly provenance: SigFieldProvenance;
  /** Verbatim human-readable text, when the structure carried any. */
  readonly text?: string;
  /** The code + recognized system, when the structure carried a coded value. */
  readonly code?: CodedValue;
}

/**
 * A best-effort, **lossy** decode of a SCRIPT structured `<Sig>` into typed
 * dosing components. Every component slot is always present and tagged
 * {@link SigFieldProvenance}, so the surface is uniform and a consumer can see
 * which fields are coded, derived, or absent.
 *
 * **Safety contract.** The free-text {@link sigText} is the source of truth and
 * is preserved **verbatim**; the structured view is **additive** and clearly
 * flagged lossy (see {@link "../common/warnings".SCRIPT_WARNING_CODES.SIG_STRUCTURED_LOSSY}).
 * The two are **never reconciled** — when structured dosing and the free text
 * disagree, both are surfaced as-is. An ambiguous structured dose is never
 * collapsed into a confident value (see
 * {@link "../common/warnings".SCRIPT_WARNING_CODES.SIG_AMBIGUOUS_DOSE}).
 */
export interface StructuredSig {
  /** The free-text SIG (`<SigText>`), verbatim — always the source of truth. */
  readonly sigText?: string;
  /** Method of dose delivery (e.g. "take", "apply"). */
  readonly doseDeliveryMethod: SigField;
  /** Dose amount (the numeric quantity), string-preserved; never a confident guess. */
  readonly dose: SigField;
  /** Unit of measure for the dose (e.g. tablet, mL). */
  readonly doseUnitOfMeasure: SigField;
  /** Route of administration (SNOMED/NCI when coded). */
  readonly route: SigField;
  /** Site of administration (SNOMED/NCI when coded). */
  readonly siteOfAdministration: SigField;
  /** Administration timing / frequency. */
  readonly administrationTiming: SigField;
  /** Duration of therapy. */
  readonly duration: SigField;
  /** Vehicle / diluent the dose is taken with. */
  readonly vehicle: SigField;
  /** Clinical indication ("as needed for ...") . */
  readonly indication: SigField;
  /** Maximum-dose restriction. */
  readonly maximumDoseRestriction: SigField;
  /** True when at least one component decoded to a non-`"absent"` value. */
  readonly hasStructuredData: boolean;
}

const ABSENT: SigField = Object.freeze({ provenance: "absent" });

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Local element names recognized for each structured-SIG component. Matched as a
 * **descendant** of `<Sig>` (the precise nesting of the NCPDP Structured and
 * Codified Sig is membership-gated and varies across SCRIPT releases, so we read
 * by recognized component name rather than a rigid path). Aliases are listed
 * widest-first. See `docs-content/spec-notes-structured-sig.md`.
 */
const COMPONENT_NAMES = {
  doseDeliveryMethod: ["DoseDeliveryMethod"],
  doseUnitOfMeasure: ["DoseUnitOfMeasure"],
  route: ["RouteOfAdministration", "Route"],
  siteOfAdministration: ["SiteOfAdministration", "Site"],
  administrationTiming: ["AdministrationTiming", "TimingAndDuration", "Frequency"],
  duration: ["Duration"],
  vehicle: ["Vehicle"],
  indication: ["Indication"],
  maximumDoseRestriction: ["MaximumDoseRestriction"],
} as const;

/** Element names that carry the dose quantity, tried widest-first. */
const DOSE_QUANTITY_NAMES = ["DoseQuantity", "Dose"] as const;

/** Component slots checked for `hasStructuredData` (all but the duplicated free text). */
const STRUCTURED_FIELDS = [
  "doseDeliveryMethod",
  "dose",
  "doseUnitOfMeasure",
  "route",
  "siteOfAdministration",
  "administrationTiming",
  "duration",
  "vehicle",
  "indication",
  "maximumDoseRestriction",
] as const satisfies readonly (keyof StructuredSig)[];

/**
 * Decode a structured SCRIPT `<Sig>` element into a {@link StructuredSig}, or
 * return `undefined` when no `<Sig>` is present under `medEl`.
 *
 * Lenient and lossy by construction: every component is read independently and
 * tagged with its provenance; unrecoverable ambiguity downgrades a field to
 * `"absent"` and warns rather than guessing. The free-text `<SigText>` is always
 * preserved verbatim. Raises {@link "../common/warnings".SCRIPT_WARNING_CODES.SIG_STRUCTURED_LOSSY}
 * once when any structured component is decoded.
 *
 * @param medEl - The `<MedicationPrescribed>` (or equivalent) element.
 * @param path - XPath-style location of `medEl` (for warning context).
 * @param warnings - Sink that collects non-fatal warnings.
 * @returns A frozen {@link StructuredSig}, or `undefined` when no `<Sig>` exists.
 *
 * @example
 * ```ts
 * const warnings: NcpdpScriptWarning[] = [];
 * const sig = extractStructuredSig(medEl, "/Message/Body/NewRx/MedicationPrescribed", warnings);
 * sig?.sigText;        // verbatim free text — the source of truth
 * sig?.route.code?.system; // "SNOMED" when the route was coded
 * ```
 */
export function extractStructuredSig(
  medEl: XmlElement,
  path: string,
  warnings: NcpdpScriptWarning[],
): StructuredSig | undefined {
  const sigEl = firstChild(medEl, "Sig");
  if (sigEl === undefined) return undefined;
  const sigPath = joinPath(path, "Sig");

  const out: Mutable<StructuredSig> = {
    doseDeliveryMethod: ABSENT,
    dose: ABSENT,
    doseUnitOfMeasure: ABSENT,
    route: ABSENT,
    siteOfAdministration: ABSENT,
    administrationTiming: ABSENT,
    duration: ABSENT,
    vehicle: ABSENT,
    indication: ABSENT,
    maximumDoseRestriction: ABSENT,
    hasStructuredData: false,
  };

  const sigText = sigComponentText(sigEl, "SigText");
  if (sigText !== undefined) out.sigText = sigText;

  for (const [field, names] of Object.entries(COMPONENT_NAMES)) {
    const el = firstNamed(sigEl, names);
    out[field as keyof typeof COMPONENT_NAMES] = readField(el);
  }

  out.dose = readDose(sigEl, sigPath, warnings);

  const hasStructuredData = STRUCTURED_FIELDS.some((field) => out[field].provenance !== "absent");
  out.hasStructuredData = hasStructuredData;

  if (hasStructuredData) {
    warnings.push(
      scriptWarning(
        SCRIPT_WARNING_CODES.SIG_STRUCTURED_LOSSY,
        "Structured SIG decoded as a best-effort, lossy view; the free-text SigText is authoritative and preserved verbatim.",
        scriptPosition(sigPath),
      ),
    );
  }

  return Object.freeze(out);
}

/**
 * Read the dose quantity, with the never-confident-dose fail-safe: when a dose
 * structure is present but no unambiguous quantity can be read, the dose is left
 * `"absent"` and {@link SCRIPT_WARNING_CODES.SIG_AMBIGUOUS_DOSE} is raised.
 */
function readDose(sigEl: XmlElement, sigPath: string, warnings: NcpdpScriptWarning[]): SigField {
  const doseEl = firstNamed(sigEl, DOSE_QUANTITY_NAMES);
  if (doseEl === undefined) return ABSENT;

  const field = readField(doseEl);
  if (field.provenance !== "absent") return field;

  // A dose container exists but yielded neither a code nor a value: ambiguous.
  // Surface it as absent rather than guessing, and flag it.
  warnings.push(
    scriptWarning(
      SCRIPT_WARNING_CODES.SIG_AMBIGUOUS_DOSE,
      "A structured dose element was present but no unambiguous quantity could be read; surfaced as absent, not guessed.",
      scriptPosition(joinPath(sigPath, doseEl.name)),
    ),
  );
  return ABSENT;
}

/**
 * Decode one component element into a {@link SigField}. A `<Code>` (optionally
 * with a `Qualifier`/`CodeSystem`) makes it `"coded"`; otherwise any text makes
 * it `"derived"`; an absent or empty element is `"absent"`.
 */
function readField(el: XmlElement | undefined): SigField {
  if (el === undefined) return ABSENT;

  const code = childText(el, "Code");
  const text = sigText(el);

  if (code !== undefined) {
    const qualifier =
      childText(el, "Qualifier") ??
      childText(el, "CodeSystem") ??
      attrValue(el, "Qualifier") ??
      attrValue(el, "CodeSystem") ??
      "";
    const out: Mutable<SigField> = { provenance: "coded", code: codedValue(code, qualifier) };
    if (text !== undefined) out.text = text;
    return Object.freeze(out);
  }

  if (text !== undefined) return Object.freeze({ provenance: "derived", text });
  return ABSENT;
}

/** A component's text: a `<Text>` child, else the element's own direct text. */
function sigText(el: XmlElement): string | undefined {
  const childTextValue = childText(el, "Text");
  if (childTextValue !== undefined) return childTextValue;
  const own = el.text.trim();
  return own.length === 0 ? undefined : own;
}

/** Trimmed direct text of a named descendant under `scope`, or `undefined`. */
function sigComponentText(scope: XmlElement, name: string): string | undefined {
  const el = firstDescendantNamed(scope, name);
  if (el === undefined) return undefined;
  const trimmed = el.text.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** First descendant of `scope` matching any of `names`, tried in order. */
function firstNamed(scope: XmlElement, names: readonly string[]): XmlElement | undefined {
  for (const name of names) {
    const el = firstDescendantNamed(scope, name);
    if (el !== undefined) return el;
  }
  return undefined;
}
