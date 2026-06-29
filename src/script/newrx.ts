import { codedValue, type CodedValue } from "../common/code-system.js";
import { decimalValue, type DecimalValue } from "../common/decimal.js";
import { joinPath, scriptPosition } from "../common/position.js";
import {
  scriptWarning,
  SCRIPT_WARNING_CODES,
  type NcpdpScriptWarning,
} from "../common/warnings.js";
import { attrValue, childText, firstChild, firstDescendantNamed } from "./nav.js";
import type { XmlElement } from "./xml-load.js";

/** A person's name as carried in SCRIPT (`<Name>`). */
export interface ScriptName {
  readonly lastName?: string;
  readonly firstName?: string;
  readonly middleName?: string;
}

/** The patient on a NewRx (`<Patient>`). */
export interface Patient {
  readonly name?: ScriptName;
  readonly gender?: string;
  /** Date of birth, verbatim — no reformatting. */
  readonly dateOfBirth?: string;
}

/** A pharmacy or prescriber identification (`<Identification>`). */
export interface PartyIdentification {
  readonly npi?: string;
  readonly deaNumber?: string;
  readonly ncpdpId?: string;
}

/** The dispensing pharmacy on a NewRx (`<Pharmacy>`). */
export interface Pharmacy {
  readonly businessName?: string;
  readonly identification?: PartyIdentification;
}

/** The prescriber on a NewRx (`<Prescriber>`). */
export interface Prescriber {
  readonly name?: ScriptName;
  readonly identification?: PartyIdentification;
}

/** A coded drug product (`<DrugCoded>`). */
export interface DrugCoded {
  /** `<ProductCode>` with its qualifier resolved to a code system. */
  readonly productCode?: CodedValue;
  /** `<DrugDBCode>` with its qualifier resolved to a code system. */
  readonly drugDbCode?: CodedValue;
}

/**
 * Explicit `<Strength>`. Surfaced independently of any strength implied by a
 * coded product — the two are **never reconciled** (see
 * {@link "../common/warnings".SCRIPT_WARNING_CODES.STRENGTH_CODED_AND_EXPLICIT}).
 */
export interface Strength {
  readonly value?: string;
  readonly form?: string;
  readonly unitOfMeasure?: string;
}

/** A dispense quantity (`<Quantity>`). */
export interface Quantity {
  readonly value?: DecimalValue;
  readonly unitOfMeasure?: string;
  readonly codeListQualifier?: string;
}

/** The prescribed medication (`<MedicationPrescribed>`). */
export interface MedicationPrescribed {
  readonly description?: string;
  readonly coded?: DrugCoded;
  readonly strength?: Strength;
  readonly quantity?: Quantity;
  readonly daysSupply?: DecimalValue;
  readonly numberOfRefills?: string;
  readonly substitutions?: string;
  /** Written date, verbatim. */
  readonly writtenDate?: string;
  /** Free-text directions (`<Directions>`), verbatim. */
  readonly directions?: string;
  /** Structured SIG free text (`<Sig><SigText>`), verbatim — not decoded in this phase. */
  readonly sigText?: string;
  readonly note?: string;
}

/** A parsed SCRIPT NewRx transaction body. */
export interface NewRx {
  readonly kind: "NewRx";
  readonly patient?: Patient;
  readonly pharmacy?: Pharmacy;
  readonly prescriber?: Prescriber;
  readonly medication?: MedicationPrescribed;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function assign<T, K extends keyof T>(target: Mutable<T>, key: K, value: T[K] | undefined): void {
  if (value !== undefined) target[key] = value;
}

function definedOrUndefined<T extends object>(obj: T): T | undefined {
  return Object.keys(obj).length === 0 ? undefined : Object.freeze(obj);
}

/**
 * Extract a {@link NewRx} from its `<NewRx>` element. Lenient throughout: any
 * absent element is left `undefined`; recoverable anomalies push a
 * {@link NcpdpScriptWarning} onto `warnings`.
 *
 * @param newRxEl - The `<NewRx>` element.
 * @param path - XPath-style location of `newRxEl` (for warning context).
 * @param warnings - Sink that collects non-fatal warnings.
 * @returns A frozen {@link NewRx}.
 *
 * @example
 * ```ts
 * const warnings: NcpdpScriptWarning[] = [];
 * const rx = extractNewRx(newRxEl, "/Message/Body/NewRx", warnings);
 * rx.medication?.description;
 * ```
 */
export function extractNewRx(
  newRxEl: XmlElement,
  path: string,
  warnings: NcpdpScriptWarning[],
): NewRx {
  const out: Mutable<NewRx> = { kind: "NewRx" };
  assign(out, "patient", extractPatient(newRxEl));
  assign(out, "pharmacy", extractPharmacy(newRxEl));
  assign(out, "prescriber", extractPrescriber(newRxEl));
  assign(
    out,
    "medication",
    extractMedication(newRxEl, joinPath(path, "MedicationPrescribed"), warnings),
  );
  return Object.freeze(out);
}

/**
 * Extract a {@link MedicationPrescribed} from its parent element's
 * `<MedicationPrescribed>` child, or `undefined` when absent. Exported so the
 * lifecycle transactions (renewal / change / cancel) surface the prescribed or
 * changed medication with the **same** semantics as NewRx — including the
 * never-reconciled coded-vs-explicit-strength warning.
 *
 * @param parentEl - The element whose `<MedicationPrescribed>` child to read.
 * @param path - XPath-style location of the `<MedicationPrescribed>` element.
 * @param warnings - Sink that collects non-fatal warnings.
 * @returns A frozen {@link MedicationPrescribed}, or `undefined`.
 *
 * @example
 * ```ts
 * const warnings: NcpdpScriptWarning[] = [];
 * const med = extractMedicationPrescribed(renewalEl, "/Message/Body/RxRenewalRequest/MedicationPrescribed", warnings);
 * med?.description;
 * ```
 */
export function extractMedicationPrescribed(
  parentEl: XmlElement,
  path: string,
  warnings: NcpdpScriptWarning[],
): MedicationPrescribed | undefined {
  return extractMedication(parentEl, path, warnings);
}

/**
 * Extract a {@link Patient} from its parent element's `<Patient>` child, or
 * `undefined` when absent. Exported for reuse across SCRIPT transactions.
 *
 * @param parentEl - The element whose `<Patient>` child to read.
 * @returns A frozen {@link Patient}, or `undefined`.
 *
 * @example
 * ```ts
 * extractPatient(renewalEl)?.name?.lastName;
 * ```
 */
export function extractPatient(parentEl: XmlElement): Patient | undefined {
  const patientEl = firstChild(parentEl, "Patient");
  if (patientEl === undefined) return undefined;
  const out: Mutable<Patient> = {};
  assign(out, "name", extractName(patientEl));
  assign(out, "gender", descendantText(patientEl, "Gender"));
  const dob = firstDescendantNamed(patientEl, "DateOfBirth");
  assign(out, "dateOfBirth", dob === undefined ? undefined : dateText(dob));
  return definedOrUndefined(out);
}

/**
 * Extract a {@link Pharmacy} from its parent element's `<Pharmacy>` child, or
 * `undefined` when absent. Exported for reuse across SCRIPT transactions.
 *
 * @param parentEl - The element whose `<Pharmacy>` child to read.
 * @returns A frozen {@link Pharmacy}, or `undefined`.
 *
 * @example
 * ```ts
 * extractPharmacy(renewalEl)?.businessName;
 * ```
 */
export function extractPharmacy(parentEl: XmlElement): Pharmacy | undefined {
  const pharmacyEl = firstChild(parentEl, "Pharmacy");
  if (pharmacyEl === undefined) return undefined;
  const out: Mutable<Pharmacy> = {};
  assign(out, "businessName", descendantText(pharmacyEl, "BusinessName"));
  assign(out, "identification", extractIdentification(pharmacyEl));
  return definedOrUndefined(out);
}

/**
 * Extract a {@link Prescriber} from its parent element's `<Prescriber>` child,
 * or `undefined` when absent. Exported for reuse across SCRIPT transactions.
 *
 * @param parentEl - The element whose `<Prescriber>` child to read.
 * @returns A frozen {@link Prescriber}, or `undefined`.
 *
 * @example
 * ```ts
 * extractPrescriber(renewalEl)?.identification?.npi;
 * ```
 */
export function extractPrescriber(parentEl: XmlElement): Prescriber | undefined {
  const prescriberEl = firstChild(parentEl, "Prescriber");
  if (prescriberEl === undefined) return undefined;
  const out: Mutable<Prescriber> = {};
  assign(out, "name", extractName(prescriberEl));
  assign(out, "identification", extractIdentification(prescriberEl));
  return definedOrUndefined(out);
}

function extractName(scope: XmlElement | undefined): ScriptName | undefined {
  if (scope === undefined) return undefined;
  const nameEl = firstDescendantNamed(scope, "Name");
  if (nameEl === undefined) return undefined;
  const out: Mutable<ScriptName> = {};
  assign(out, "lastName", childText(nameEl, "LastName"));
  assign(out, "firstName", childText(nameEl, "FirstName"));
  assign(out, "middleName", childText(nameEl, "MiddleName"));
  return definedOrUndefined(out);
}

function extractIdentification(scope: XmlElement | undefined): PartyIdentification | undefined {
  if (scope === undefined) return undefined;
  const idEl = firstDescendantNamed(scope, "Identification");
  if (idEl === undefined) return undefined;
  const out: Mutable<PartyIdentification> = {};
  assign(out, "npi", childText(idEl, "NPI"));
  assign(out, "deaNumber", childText(idEl, "DEANumber"));
  assign(out, "ncpdpId", childText(idEl, "NCPDPID"));
  return definedOrUndefined(out);
}

function extractMedication(
  newRxEl: XmlElement,
  path: string,
  warnings: NcpdpScriptWarning[],
): MedicationPrescribed | undefined {
  const medEl = firstChild(newRxEl, "MedicationPrescribed");
  if (medEl === undefined) return undefined;

  const out: Mutable<MedicationPrescribed> = {};
  assign(out, "description", childText(medEl, "DrugDescription"));

  const coded = extractDrugCoded(medEl);
  assign(out, "coded", coded);

  const strength = extractStrength(medEl);
  assign(out, "strength", strength);

  if (coded !== undefined && strength !== undefined) {
    warnings.push(
      scriptWarning(
        SCRIPT_WARNING_CODES.STRENGTH_CODED_AND_EXPLICIT,
        "Both a coded drug and an explicit Strength are present; both are surfaced and are not reconciled.",
        scriptPosition(path),
      ),
    );
  }

  assign(out, "quantity", extractQuantity(medEl));
  const daysSupply = childText(medEl, "DaysSupply");
  assign(out, "daysSupply", daysSupply === undefined ? undefined : decimalValue(daysSupply));
  assign(out, "numberOfRefills", refillCount(medEl));
  assign(out, "substitutions", childText(medEl, "Substitutions"));
  const written = firstDescendantNamed(medEl, "WrittenDate");
  assign(out, "writtenDate", written === undefined ? undefined : dateText(written));
  assign(out, "directions", childText(medEl, "Directions"));
  const sigEl = firstDescendantNamed(medEl, "SigText");
  assign(out, "sigText", sigEl === undefined ? undefined : sigEl.text.trim() || undefined);
  assign(out, "note", childText(medEl, "Note"));

  return definedOrUndefined(out);
}

function extractDrugCoded(medEl: XmlElement): DrugCoded | undefined {
  const codedEl = firstChild(medEl, "DrugCoded");
  if (codedEl === undefined) return undefined;
  const out: Mutable<DrugCoded> = {};

  const productCode = firstChild(codedEl, "ProductCode");
  if (productCode !== undefined && productCode.text.trim().length > 0) {
    out.productCode = codedValue(
      productCode.text.trim(),
      attrValue(productCode, "Qualifier") ?? "",
    );
  }

  const dbCode = firstChild(codedEl, "DrugDBCode");
  if (dbCode !== undefined) {
    const code = childText(dbCode, "Code") ?? dbCode.text.trim();
    if (code.length > 0) {
      out.drugDbCode = codedValue(
        code,
        childText(dbCode, "Qualifier") ?? attrValue(dbCode, "Qualifier") ?? "",
      );
    }
  }

  return definedOrUndefined(out);
}

function extractStrength(medEl: XmlElement): Strength | undefined {
  const strengthEl = firstChild(medEl, "Strength");
  if (strengthEl === undefined) return undefined;
  const out: Mutable<Strength> = {};
  assign(out, "value", childText(strengthEl, "StrengthValue"));
  assign(out, "form", codeOrText(strengthEl, "StrengthForm"));
  assign(out, "unitOfMeasure", codeOrText(strengthEl, "StrengthUnitOfMeasure"));
  return definedOrUndefined(out);
}

function extractQuantity(medEl: XmlElement): Quantity | undefined {
  const qtyEl = firstChild(medEl, "Quantity");
  if (qtyEl === undefined) return undefined;
  const out: Mutable<Quantity> = {};
  const value = childText(qtyEl, "Value");
  assign(out, "value", value === undefined ? undefined : decimalValue(value));
  assign(out, "unitOfMeasure", codeOrText(qtyEl, "QuantityUnitOfMeasure"));
  assign(out, "codeListQualifier", childText(qtyEl, "CodeListQualifier"));
  return definedOrUndefined(out);
}

/** Refill count, tolerating either a plain `<NumberOfRefills>` or a `<Refills><Value>`. */
function refillCount(medEl: XmlElement): string | undefined {
  const plain = childText(medEl, "NumberOfRefills");
  if (plain !== undefined) return plain;
  const refills = firstChild(medEl, "Refills");
  return refills === undefined ? undefined : childText(refills, "Value");
}

/** Trimmed text of a `<Code>` child, falling back to the element's own text. */
function codeOrText(parent: XmlElement, child: string): string | undefined {
  const el = firstChild(parent, child);
  if (el === undefined) return undefined;
  return childText(el, "Code") ?? (el.text.trim() || undefined);
}

/** Trimmed text of the first descendant named `name`. */
function descendantText(scope: XmlElement, name: string): string | undefined {
  const el = firstDescendantNamed(scope, name);
  if (el === undefined) return undefined;
  return el.text.trim() || undefined;
}

/** Date text from a wrapper element: prefer a `<Date>` child, else own text. */
function dateText(el: XmlElement): string | undefined {
  return childText(el, "Date") ?? (el.text.trim() || undefined);
}
