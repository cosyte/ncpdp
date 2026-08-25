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
 * - `"coded"`: the structured element carried a code (with an optional system
 *   qualifier); a {@link SigField.code} is present.
 * - `"derived"`: a value was read from the structured element but it was not
 *   coded; only {@link SigField.text} is present.
 * - `"absent"`: the structured element was missing or empty; neither a code nor
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
 * The two are **never reconciled**: when structured dosing and the free text
 * disagree, both are surfaced as-is. An ambiguous structured dose is never
 * collapsed into a confident value (see
 * {@link "../common/warnings".SCRIPT_WARNING_CODES.SIG_AMBIGUOUS_DOSE}).
 *
 * **A component only decodes when its element name is grounded.** A slot whose
 * name this release cannot trace to a published field label always reads
 * `"absent"`, whatever the message carried: see {@link SIG_COMPONENT_NAMES} for
 * which slots those are and {@link SIG_NAME_PROVENANCE} for the evidence behind
 * the rest.
 */
export interface StructuredSig {
  /** The free-text SIG (`<SigText>`), verbatim: always the source of truth. */
  readonly sigText?: string;
  /** Method of dose delivery (e.g. "take", "apply"). */
  readonly doseDeliveryMethod: SigField;
  /** Dose amount (the numeric quantity), string-preserved; never a confident guess. */
  readonly dose: SigField;
  /** Unit of measure for the dose. **No grounded element name: always `"absent"`.** */
  readonly doseUnitOfMeasure: SigField;
  /** Route of administration (SNOMED/NCI when coded). */
  readonly route: SigField;
  /** Site of administration (SNOMED/NCI when coded). */
  readonly siteOfAdministration: SigField;
  /** Administration timing. */
  readonly administrationTiming: SigField;
  /** Duration of therapy. **No grounded element name: always `"absent"`.** */
  readonly duration: SigField;
  /** Vehicle / diluent. **No grounded element name: always `"absent"`.** */
  readonly vehicle: SigField;
  /** Clinical indication. **No grounded element name: always `"absent"`.** */
  readonly indication: SigField;
  /** Maximum-dose restriction. **No grounded element name: always `"absent"`.** */
  readonly maximumDoseRestriction: SigField;
  /** True when at least one component decoded to a non-`"absent"` value. */
  readonly hasStructuredData: boolean;
}

const ABSENT: SigField = Object.freeze({ provenance: "absent" });

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * The ten structured-SIG component slots, in declaration order. Every slot is
 * always present on a {@link StructuredSig}, and this is the list
 * {@link StructuredSig.hasStructuredData} is computed over.
 *
 * @example
 * ```ts
 * SIG_COMPONENT_SLOTS.includes("route"); // true
 * ```
 */
export const SIG_COMPONENT_SLOTS = [
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

/** One structured-SIG component slot name. */
export type SigComponentSlot = (typeof SIG_COMPONENT_SLOTS)[number];

/**
 * Why one element name is recognized: the published artifact whose field label
 * the name transcribes, so a consumer trusting a coded dose can see what
 * established the name rather than taking it on faith.
 *
 * @example
 * ```ts
 * SIG_NAME_PROVENANCE.Route.label; // "Route"
 * ```
 */
export interface SigNameProvenance {
  /** The component slot this name populates. */
  readonly component: SigComponentSlot;
  /** The field label, quoted verbatim from {@link SigNameProvenance.artifact}. */
  readonly label: string;
  /** The artifact that carries the label. */
  readonly artifact: string;
  /** Where that artifact was retrieved from. */
  readonly url: string;
  /** ISO date the artifact was retrieved. */
  readonly retrieved: string;
}

// Provenance for the structured-SIG recognized element names.
//
// RETRIEVAL. Table 1 ("Segments and fields in the structured and codified Sig
// format") of Liu H, Burkhart Q, Bell DS, "Evaluation of the NCPDP Structured
// and Codified Sig Format for e-prescriptions", JAMIA 2011;18(5):645-651,
// retrieved 2026-08-25 from https://pmc.ncbi.nlm.nih.gov/articles/PMC3168301/
// and committed at work/specs/S0108-ncpdp-sig-ground-1/sources/ (sha256
// 9269e58a7a29fe9a28596e039a6f5aba448cc303883acfc78dbefa1abfe4f484). That table
// is a peer-reviewed inventory of the format's 13 segments and their fields; it
// is not an NCPDP publication, which is why these labels can be written down at
// all. The standard itself is behind membership and purchase, corroborated by
// https://www.ncpdp.org/resources.aspx retrieved the same day.
//
// METHOD. Each name below was compared against Table 1 with case, spacing and
// punctuation removed, and kept only where the matching label is a FIELD label
// and denotes the same component the name populates here. A label naming the
// ENCLOSING SEGMENT does not ground a component name: the table separates the
// two in its own columns, and "Route of administration segment" is the container
// for the field "Route", not another spelling of it. Ten of the fifteen names
// this list previously carried had no such label and were removed rather than
// left matching on the strength of looking plausible.
//
// NEGATIVE CONTROL. The same normalized comparison finds no Table 1 label for
// the removed names (Dose, DoseUnitOfMeasure, RouteOfAdministration,
// SiteOfAdministration, TimingAndDuration, Frequency, Duration, Vehicle,
// Indication, MaximumDoseRestriction) while finding one for each name kept, so
// the comparison is discriminating and not a blanket pass. `DoseUnitOfMeasure`
// does occur verbatim on the NCPDP resources page, but there it names an NCI
// Thesaurus terminology SUBSET (a value space) rather than a Sig component
// element, so it fails the same-component test and is removed with the rest.
//
// THE ASSUMPTION, STATED OUT LOUD. Table 1 gives conceptual field labels in
// title case and prose; this list is matched against XML element LOCAL NAMES.
// Those are the same artifact only insofar as the standard's schema spells each
// label as its closed-up element name. Nothing public that this package can
// cite confirms that, because the Implementation Guides are paywalled. IF THE
// ASSUMPTION IS WRONG the name simply never matches, the component reads
// "absent", and nothing is inferred from the free text: the failure is silence,
// not a confident wrong dose.
//
// QUALIFICATION. This is a SINGLE SOURCE, and it studies Sig Format v1.0 as
// implemented in SCRIPT 10.5, not the federally adopted 2017071 / 2023011 this
// package supports. The NCPDP resources page records that 2023011 carries
// "modifications to Structured and Codified Sig Structure format", so the
// inventory is evidence about the format's fields and is NOT normative for the
// adopted releases. Treat every name here as grounded-but-provisional.
//
// If you touch this list, re-read the committed artifact. Do not edit it from
// memory, and do not ADD a name: a name that does not match costs a component,
// a name that matches the WRONG element costs a wrong dispense.
/**
 * The published field label behind each recognized element name. Keyed by the
 * element name exactly as matched, so a reader can go from a decoded component
 * back to the artifact that established its name.
 *
 * @example
 * ```ts
 * SIG_NAME_PROVENANCE.DoseQuantity.component; // "dose"
 * ```
 */
export const SIG_NAME_PROVENANCE = {
  DoseDeliveryMethod: {
    component: "doseDeliveryMethod",
    label: "Dose delivery method",
    artifact:
      "Liu H, Burkhart Q, Bell DS. Evaluation of the NCPDP Structured and Codified Sig Format for e-prescriptions. JAMIA 2011;18(5):645-651, table 1",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3168301/",
    retrieved: "2026-08-25",
  },
  DoseQuantity: {
    component: "dose",
    label: "Dose quantity",
    artifact:
      "Liu H, Burkhart Q, Bell DS. Evaluation of the NCPDP Structured and Codified Sig Format for e-prescriptions. JAMIA 2011;18(5):645-651, table 1",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3168301/",
    retrieved: "2026-08-25",
  },
  Route: {
    component: "route",
    label: "Route",
    artifact:
      "Liu H, Burkhart Q, Bell DS. Evaluation of the NCPDP Structured and Codified Sig Format for e-prescriptions. JAMIA 2011;18(5):645-651, table 1",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3168301/",
    retrieved: "2026-08-25",
  },
  Site: {
    component: "siteOfAdministration",
    label: "Site",
    artifact:
      "Liu H, Burkhart Q, Bell DS. Evaluation of the NCPDP Structured and Codified Sig Format for e-prescriptions. JAMIA 2011;18(5):645-651, table 1",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3168301/",
    retrieved: "2026-08-25",
  },
  AdministrationTiming: {
    component: "administrationTiming",
    label: "Administration timing",
    artifact:
      "Liu H, Burkhart Q, Bell DS. Evaluation of the NCPDP Structured and Codified Sig Format for e-prescriptions. JAMIA 2011;18(5):645-651, table 1",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3168301/",
    retrieved: "2026-08-25",
  },
} as const satisfies Record<string, SigNameProvenance>;

/**
 * Local element names recognized for each structured-SIG component, matched as a
 * **descendant** of `<Sig>` (the precise nesting is membership-gated and varies
 * across SCRIPT releases, so the decoder reads by recognized component name
 * rather than a rigid path).
 *
 * Every name here has an entry in {@link SIG_NAME_PROVENANCE}. **A slot with an
 * empty list has no name this release can ground, so it always decodes
 * `"absent"`**, which is the fail-safe direction: the structured view either
 * shows its work or shows nothing. See `docs-content/spec-notes-structured-sig.md`.
 *
 * @example
 * ```ts
 * SIG_COMPONENT_NAMES.route; // ["Route"]
 * SIG_COMPONENT_NAMES.vehicle; // [] : no grounded name, always absent
 * ```
 */
export const SIG_COMPONENT_NAMES = {
  doseDeliveryMethod: ["DoseDeliveryMethod"],
  dose: ["DoseQuantity"],
  doseUnitOfMeasure: [],
  route: ["Route"],
  siteOfAdministration: ["Site"],
  administrationTiming: ["AdministrationTiming"],
  duration: [],
  vehicle: [],
  indication: [],
  maximumDoseRestriction: [],
} as const satisfies Record<SigComponentSlot, readonly string[]>;

// Element names that carry the dose quantity. This stays a CLOSED list because
// `readDose` puts the matched element's name on a diagnostic position: widening
// it to "whatever the element was called" would put a sender-chosen name on a
// diagnostic surface. See the comment in `readDose`.
const DOSE_QUANTITY_NAMES = SIG_COMPONENT_NAMES.dose;

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
 * sig?.sigText;        // verbatim free text: the source of truth
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

  for (const field of SIG_COMPONENT_SLOTS) {
    // The dose has its own reader: it is the one component with a fail-safe of
    // its own (an ambiguous quantity warns rather than guessing).
    if (field === "dose") continue;
    out[field] = readField(firstNamed(sigEl, SIG_COMPONENT_NAMES[field]));
  }

  out.dose = readDose(sigEl, sigPath, warnings);

  const hasStructuredData = SIG_COMPONENT_SLOTS.some((field) => out[field].provenance !== "absent");
  out.hasStructuredData = hasStructuredData;

  if (hasStructuredData) {
    warnings.push(
      scriptWarning(SCRIPT_WARNING_CODES.SIG_STRUCTURED_LOSSY, scriptPosition(sigPath)),
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
      // `doseEl.name` comes from the closed DOSE_QUANTITY_NAMES list, so it is
      // safe here; it is spelled out because a future widening of that list to
      // "whatever the element was called" would silently make it unsafe.
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
