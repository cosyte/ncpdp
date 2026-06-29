import type { CodedValue } from "../common/code-system.js";
import type { DecimalValue } from "../common/decimal.js";
import type { ScriptHeader } from "./header.js";
import type {
  LifecycleRequest,
  LifecycleResponse,
  ResponseOutcome,
  ResponseReason,
} from "./lifecycle.js";
import type { ScriptBody, ScriptMessage } from "./message.js";
import type {
  DrugCoded,
  MedicationPrescribed,
  NewRx,
  PartyIdentification,
  Patient,
  Pharmacy,
  Prescriber,
  Quantity,
  ScriptName,
  Strength,
} from "./newrx.js";
import type { ResponseBody } from "./response.js";
import type { SigField, StructuredSig } from "./sig.js";

/**
 * A minimal XML node: a tag with either child elements or leaf text (never both),
 * plus optional attributes. The {@link render} walk turns a tree of these into a
 * spec-clean XML string. Building an explicit tree (rather than concatenating
 * strings) keeps escaping centralized and the structure auditable.
 */
interface XmlNode {
  readonly tag: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly text?: string;
  readonly children?: readonly XmlNode[];
}

/** Escape the five XML text-significant characters for element content. */
function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escape an attribute value (text escapes plus the double quote). */
function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

function renderAttrs(attrs: Readonly<Record<string, string>> | undefined): string {
  if (attrs === undefined) return "";
  return Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
    .join("");
}

/** Render an {@link XmlNode} tree to an indented, spec-clean XML string. */
function render(node: XmlNode, indent: string): string {
  const open = `${indent}<${node.tag}${renderAttrs(node.attrs)}`;
  if (node.children !== undefined && node.children.length > 0) {
    const inner = node.children.map((c) => render(c, `${indent}  `)).join("\n");
    return `${open}>\n${inner}\n${indent}</${node.tag}>`;
  }
  if (node.text !== undefined) {
    return `${open}>${escapeText(node.text)}</${node.tag}>`;
  }
  return `${open}/>`;
}

/** A leaf element with text, or `undefined` when the value is absent. */
function leaf(tag: string, value: string | undefined): XmlNode | undefined {
  return value === undefined ? undefined : { tag, text: value };
}

/** A container element with the given children (undefined entries dropped). */
function container(
  tag: string,
  children: readonly (XmlNode | undefined)[],
  attrs?: Readonly<Record<string, string>>,
): XmlNode | undefined {
  const kept = children.filter((c): c is XmlNode => c !== undefined);
  if (kept.length === 0 && attrs === undefined) return undefined;
  const node: XmlNode =
    attrs === undefined ? { tag, children: kept } : { tag, attrs, children: kept };
  return node;
}

function decimalLeaf(tag: string, value: DecimalValue | undefined): XmlNode | undefined {
  return value === undefined ? undefined : { tag, text: value.source };
}

/** Serialize a {@link CodedValue} as `<tag Qualifier="…">value</tag>` (qualifier dropped when empty). */
function codedAttrLeaf(tag: string, coded: CodedValue | undefined): XmlNode | undefined {
  if (coded === undefined) return undefined;
  if (coded.qualifier === "") return { tag, text: coded.value };
  return { tag, attrs: { Qualifier: coded.qualifier }, text: coded.value };
}

function nameNode(name: ScriptName | undefined): XmlNode | undefined {
  if (name === undefined) return undefined;
  return container("Name", [
    leaf("LastName", name.lastName),
    leaf("FirstName", name.firstName),
    leaf("MiddleName", name.middleName),
  ]);
}

function identificationNode(id: PartyIdentification | undefined): XmlNode | undefined {
  if (id === undefined) return undefined;
  return container("Identification", [
    leaf("NPI", id.npi),
    leaf("DEANumber", id.deaNumber),
    leaf("NCPDPID", id.ncpdpId),
  ]);
}

function patientNode(patient: Patient | undefined): XmlNode | undefined {
  if (patient === undefined) return undefined;
  return container("Patient", [
    nameNode(patient.name),
    leaf("Gender", patient.gender),
    leaf("DateOfBirth", patient.dateOfBirth),
  ]);
}

function pharmacyNode(pharmacy: Pharmacy | undefined): XmlNode | undefined {
  if (pharmacy === undefined) return undefined;
  return container("Pharmacy", [
    leaf("BusinessName", pharmacy.businessName),
    identificationNode(pharmacy.identification),
  ]);
}

function prescriberNode(prescriber: Prescriber | undefined): XmlNode | undefined {
  if (prescriber === undefined) return undefined;
  return container("Prescriber", [
    nameNode(prescriber.name),
    identificationNode(prescriber.identification),
  ]);
}

function drugCodedNode(coded: DrugCoded | undefined): XmlNode | undefined {
  if (coded === undefined) return undefined;
  const dbCode =
    coded.drugDbCode === undefined
      ? undefined
      : container("DrugDBCode", [
          leaf("Code", coded.drugDbCode.value),
          coded.drugDbCode.qualifier === ""
            ? undefined
            : leaf("Qualifier", coded.drugDbCode.qualifier),
        ]);
  return container("DrugCoded", [codedAttrLeaf("ProductCode", coded.productCode), dbCode]);
}

function strengthNode(strength: Strength | undefined): XmlNode | undefined {
  if (strength === undefined) return undefined;
  return container("Strength", [
    leaf("StrengthValue", strength.value),
    leaf("StrengthForm", strength.form),
    leaf("StrengthUnitOfMeasure", strength.unitOfMeasure),
  ]);
}

function quantityNode(quantity: Quantity | undefined): XmlNode | undefined {
  if (quantity === undefined) return undefined;
  return container("Quantity", [
    decimalLeaf("Value", quantity.value),
    leaf("CodeListQualifier", quantity.codeListQualifier),
    leaf("QuantityUnitOfMeasure", quantity.unitOfMeasure),
  ]);
}

/** Canonical element name for each structured-SIG component slot (the parser's first alias). */
const SIG_COMPONENT_TAGS = {
  doseDeliveryMethod: "DoseDeliveryMethod",
  dose: "DoseQuantity",
  doseUnitOfMeasure: "DoseUnitOfMeasure",
  route: "RouteOfAdministration",
  siteOfAdministration: "SiteOfAdministration",
  administrationTiming: "AdministrationTiming",
  duration: "Duration",
  vehicle: "Vehicle",
  indication: "Indication",
  maximumDoseRestriction: "MaximumDoseRestriction",
} as const satisfies Record<string, string>;

/** Serialize one {@link SigField}, or `undefined` when the field is absent. */
function sigFieldNode(tag: string, field: SigField): XmlNode | undefined {
  if (field.provenance === "absent") return undefined;
  if (field.provenance === "coded" && field.code !== undefined) {
    return container(tag, [
      leaf("Code", field.code.value),
      field.code.qualifier === "" ? undefined : leaf("Qualifier", field.code.qualifier),
      leaf("Text", field.text),
    ]);
  }
  return leaf(tag, field.text);
}

function sigNode(sig: StructuredSig): XmlNode {
  const children: (XmlNode | undefined)[] = [leaf("SigText", sig.sigText)];
  for (const [slot, tag] of Object.entries(SIG_COMPONENT_TAGS)) {
    children.push(sigFieldNode(tag, sig[slot as keyof typeof SIG_COMPONENT_TAGS]));
  }
  return { tag: "Sig", children: children.filter((c): c is XmlNode => c !== undefined) };
}

function medicationNode(med: MedicationPrescribed | undefined): XmlNode | undefined {
  if (med === undefined) return undefined;
  // `<Sig>` carries SigText when a structured sig is present; otherwise a bare
  // `<SigText>` reproduces the free-text-only shape the parser read.
  const sigChildren: (XmlNode | undefined)[] =
    med.sig !== undefined ? [sigNode(med.sig)] : [leaf("SigText", med.sigText)];
  return container("MedicationPrescribed", [
    leaf("DrugDescription", med.description),
    drugCodedNode(med.coded),
    strengthNode(med.strength),
    quantityNode(med.quantity),
    decimalLeaf("DaysSupply", med.daysSupply),
    leaf("Substitutions", med.substitutions),
    leaf("NumberOfRefills", med.numberOfRefills),
    leaf("WrittenDate", med.writtenDate),
    leaf("Directions", med.directions),
    ...sigChildren,
    leaf("Note", med.note),
  ]);
}

function newRxNode(body: NewRx): XmlNode {
  return (
    container("NewRx", [
      patientNode(body.patient),
      pharmacyNode(body.pharmacy),
      prescriberNode(body.prescriber),
      medicationNode(body.medication),
    ]) ?? { tag: "NewRx", children: [] }
  );
}

function lifecycleRequestNode(body: LifecycleRequest): XmlNode {
  return (
    container(body.kind, [
      leaf("RequestReferenceNumber", body.requestReferenceNumber),
      patientNode(body.patient),
      pharmacyNode(body.pharmacy),
      prescriberNode(body.prescriber),
      medicationNode(body.medicationPrescribed),
    ]) ?? { tag: body.kind, children: [] }
  );
}

/** Element name carrying each lifecycle outcome; `unknown` has no element. */
const OUTCOME_TAGS: Record<ResponseOutcome, string | undefined> = {
  denied: "Denied",
  deniedNewToFollow: "DenyNewToFollow",
  approvedWithChanges: "ApprovedWithChanges",
  approved: "Approved",
  validated: "Validated",
  replace: "Replace",
  unknown: undefined,
};

function reasonChildren(reason: ResponseReason | undefined): (XmlNode | undefined)[] {
  if (reason === undefined) return [];
  return [
    leaf("ReasonCode", reason.code),
    leaf("ReferenceNumber", reason.referenceNumber),
    leaf("DenialReason", reason.denialReason),
    leaf("Note", reason.note),
  ];
}

function lifecycleResponseNode(body: LifecycleResponse): XmlNode {
  const outcomeTag = OUTCOME_TAGS[body.outcome];
  const outcomeNode =
    outcomeTag === undefined
      ? undefined
      : (container(outcomeTag, reasonChildren(body.reason)) ?? { tag: outcomeTag, children: [] });
  const responseNode: XmlNode = {
    tag: "Response",
    children: outcomeNode === undefined ? [] : [outcomeNode],
  };
  return {
    tag: body.kind,
    children: [
      leaf("RequestReferenceNumber", body.requestReferenceNumber),
      responseNode,
      medicationNode(body.medicationPrescribed),
    ].filter((c): c is XmlNode => c !== undefined),
  };
}

function responseNode(body: ResponseBody): XmlNode {
  return (
    container(body.kind, [
      leaf("Code", body.code),
      leaf("DescriptionCode", body.descriptionCode),
      leaf("Description", body.description),
    ]) ?? { tag: body.kind, children: [] }
  );
}

function bodyNode(body: ScriptBody): XmlNode {
  switch (body.kind) {
    case "NewRx":
      return newRxNode(body);
    case "RxRenewalRequest":
    case "RxChangeRequest":
    case "CancelRx":
      return lifecycleRequestNode(body);
    case "RxRenewalResponse":
    case "RxChangeResponse":
    case "CancelRxResponse":
      return lifecycleResponseNode(body);
    case "Status":
    case "Error":
    case "Verify":
      return responseNode(body);
    case "unsupported":
      return { tag: body.transaction };
  }
}

function headerNode(header: ScriptHeader): XmlNode | undefined {
  return container("Header", [
    leaf("To", header.to),
    leaf("From", header.from),
    leaf("MessageID", header.messageId),
    leaf("RelatesToMessageID", header.relatesToMessageId),
    leaf("SentTime", header.sentTime),
    leaf("PrescriberOrderNumber", header.prescriberOrderNumber),
  ]);
}

/**
 * Serialize a parsed {@link ScriptMessage} back to canonical NCPDP SCRIPT XML.
 * The conservative (emit) half of Postel's Law: it walks the model faithfully and
 * never warns. Only the **modeled** fields are emitted — SCRIPT is a lossy
 * structural read, so a value the parser does not surface cannot be reproduced;
 * this is the honest round-trip contract.
 *
 * The output is **canonical**, not byte-identical to the input: namespace
 * prefixes and wrapper elements the parser flattens (e.g. `<HumanPatient>`) are
 * dropped, and indentation is normalized. Serializing is idempotent —
 * `serialize(parse(serialize(m)))` equals `serialize(m)`. Values are XML-escaped;
 * because the XXE-safe loader does not resolve entities, a value carrying a raw
 * `<`, `>`, or `&` survives only when it was entity-free to begin with (the
 * synthetic corpus is).
 *
 * @param message - A parsed message from {@link "./parse".parseScript}.
 * @returns The canonical SCRIPT XML string.
 *
 * @example
 * ```ts
 * import { parseScript, serializeScript } from "@cosyte/ncpdp/script";
 * const xml = serializeScript(parseScript(raw));
 * parseScript(xml); // re-parses cleanly
 * ```
 */
export function serializeScript(message: ScriptMessage): string {
  const version = message.header.version;
  const attrs = version === undefined ? undefined : { version };
  const children = [
    headerNode(message.header),
    { tag: "Body", children: [bodyNode(message.body)] },
  ];
  const root: XmlNode = {
    tag: "Message",
    ...(attrs === undefined ? {} : { attrs }),
    children: children.filter((c): c is XmlNode => c !== undefined),
  };
  return render(root, "");
}
