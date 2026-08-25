import { describe, expect, it } from "vitest";
import {
  assertNoDiagnosticPhiLeak,
  type DiagnosticSlot,
  type DiagnosticSurfaceOptions,
} from "@cosyte/test-utils";

import {
  SCRIPT_WARNING_CODES,
  SCRIPT_FATAL_CODES,
  SCRIPT_WARNING_MESSAGES,
  type ScriptWarningCode,
} from "../../src/common/index.js";
import { parseScript, type ScriptMessage } from "../../src/script/index.js";
import {
  parseTelecom,
  TELECOM_WARNING_CODES,
  TELECOM_FATAL_CODES,
  TELECOM_WARNING_MESSAGES,
  type TelecomWarningCode,
  type TelecomTransaction,
} from "../../src/telecom/index.js";

/**
 * The diagnostic-surface PHI gate for both NCPDP dialects.
 *
 * This is the deliverable, not the fix. The slot table below declares EVERY
 * position a sender controls in each wire format, not the ones that look like
 * PHI, because the ecosystem audit (2026-07-30) found all thirteen parsers'
 * PHI suites green over unreachable space: sentinels planted where no warning
 * factory could ever see them, while the slots that actually leaked were handed
 * clean values.
 *
 * Every slot names the diagnostic code it must reach. The runner fails a slot
 * whose code never appeared, so a probe that quietly missed its branch is a red,
 * not a pass.
 */

// ---------------------------------------------------------------------------
// SCRIPT (XML) document builders. Every literal here is synthetic.
// ---------------------------------------------------------------------------

const SYNTH_HEADER =
  "<Header><To>SYNTHPHARMACY</To><From>SYNTHPRESCRIBER</From>" +
  "<MessageID>SYNTH-MSG-0001</MessageID></Header>";

/** A `<Message>` with the given raw body markup and an explicitly known version. */
function scriptMessage(bodyMarkup: string, version = "2017071"): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Message xmlns="http://www.ncpdp.org/schema/SCRIPT" version="${version}">` +
    `${SYNTH_HEADER}<Body>${bodyMarkup}</Body></Message>`
  );
}

/** A structured-SIG NewRx, whose optional pieces each take a planted marker. */
function newRxWithSig(parts: {
  drugDescription?: string;
  productCode?: string;
  productQualifier?: string;
  medAttr?: string;
  emptyDose?: boolean;
  strength?: boolean;
}): string {
  const attr = parts.medAttr === undefined ? "" : ` SchemaVersion="${parts.medAttr}"`;
  const coded =
    parts.productCode === undefined
      ? ""
      : `<DrugCoded><ProductCode Qualifier="${parts.productQualifier ?? "ND"}">` +
        `${parts.productCode}</ProductCode></DrugCoded>`;
  const strength =
    parts.strength === true ? "<Strength><StrengthValue>10</StrengthValue></Strength>" : "";
  const dose =
    parts.emptyDose === true
      ? "<Dose><DoseQuantity></DoseQuantity></Dose>"
      : "<Dose><DoseQuantity>1</DoseQuantity></Dose>";
  return (
    `<NewRx><MedicationPrescribed${attr}>` +
    `<DrugDescription>${parts.drugDescription ?? "Synthetic Tablet 250 MG"}</DrugDescription>` +
    coded +
    strength +
    `<Sig><SigText>Take one tablet by mouth daily.</SigText>` +
    `<Instruction><DoseAdministration>${dose}</DoseAdministration>` +
    // `Route` is the recognized route name, so this corpus keeps reaching the
    // lossy-decode warning. Spelled with a name the decoder no longer matches,
    // the route would read absent and this corpus would stop exercising the
    // code it is here to exercise.
    `<Route><Text>by mouth</Text></Route>` +
    `</Instruction></Sig>` +
    `</MedicationPrescribed></NewRx>`
  );
}

// ---------------------------------------------------------------------------
// Telecom (fixed-field) builders. Every literal here is synthetic.
// ---------------------------------------------------------------------------

const FS = "\x1c";
const GS = "\x1d";
const RS = "\x1e";

function pad(value: string, width: number): string {
  return value.padEnd(width).slice(0, width);
}

interface HeaderParts {
  readonly bin?: string;
  readonly version?: string;
  readonly transactionCode?: string;
  readonly pcn?: string;
  readonly providerQualifier?: string;
  readonly providerId?: string;
  readonly dateOfService?: string;
  readonly softwareId?: string;
}

function requestHeader(parts: HeaderParts = {}): string {
  return (
    pad(parts.bin ?? "999999", 6) +
    pad(parts.version ?? "D0", 2) +
    pad(parts.transactionCode ?? "B1", 2) +
    pad(parts.pcn ?? "PCN0000000", 10) +
    pad("1", 1) +
    pad(parts.providerQualifier ?? "01", 2) +
    pad(parts.providerId ?? "1234567890", 15) +
    pad(parts.dateOfService ?? "20260629", 8) +
    pad(parts.softwareId ?? "SW00000000", 10)
  );
}

function responseHeader(): string {
  return (
    pad("D0", 2) + pad("B1", 2) + pad("1", 1) + pad("A", 1) + pad("01", 2) + pad("1234567890", 15)
  );
}

/** Raw segment: an explicit Segment Identification value plus FS-joined tokens. */
function rawSegment(amValue: string, tokens: readonly string[]): string {
  return [`AM${amValue}`, ...tokens].join(FS);
}

function segment(id: string, fields: ReadonlyArray<readonly [string, string]>): string {
  return rawSegment(
    id,
    fields.map(([fid, v]) => `${fid}${v}`),
  );
}

/** A spec-clean unmodeled segment, used to give a value-slot probe a diagnostic to reach. */
const UNKNOWN_SEGMENT_99 = segment("99", [["ZZ", "SYNTH"]]);

function requestTransmission(header: HeaderParts, segments: readonly string[]): string {
  return requestHeader(header) + segments.join(RS);
}

function responseTransmission(segments: readonly string[]): string {
  return responseHeader() + GS + segments.join(RS);
}

// ---------------------------------------------------------------------------
// The gate.
// ---------------------------------------------------------------------------

/** Every position a SCRIPT sender controls. The table is the deliverable. */
export const SCRIPT_SLOTS: DiagnosticSlot<string>[] = [
  // --- structural identifiers: element and transaction names -----------
  {
    name: "/<root> (root element local name)",
    plant: (m) => `<${m} version="2017071">${SYNTH_HEADER}<Body/></${m}>`,
    expectCode: SCRIPT_FATAL_CODES.NO_MESSAGE_ROOT,
  },
  {
    name: "/Message/Body/<transaction> (unmodeled transaction element name)",
    plant: (m) => scriptMessage(`<${m}><Note>synthetic</Note></${m}>`),
    expectCode: SCRIPT_WARNING_CODES.UNSUPPORTED_TRANSACTION,
  },
  {
    name: "/Message/Body/Status/<child> (element name inside a response)",
    plant: (m) => scriptMessage(`<Status><${m}>synthetic</${m}></Status>`),
    expectCode: SCRIPT_WARNING_CODES.MISSING_REQUIRED_ELEMENT,
  },
  {
    name: "/Message/Body/RxRenewalResponse/Response/<child> (unrecognized outcome element name)",
    plant: (m) =>
      scriptMessage(
        `<RxRenewalResponse><Response><${m}>synthetic</${m}></Response></RxRenewalResponse>`,
      ),
    expectCode: SCRIPT_WARNING_CODES.LIFECYCLE_OUTCOME_UNRECOGNIZED,
  },
  {
    name: "/Message/Body/NewRx/MedicationPrescribed/Sig//<child> (SIG component element name)",
    // The marker is a sender-chosen element name sitting inside the element the
    // decoder DID match. The ambiguous-dose position is built from
    // `DoseQuantity`, a name the library closed, so the planted name has no
    // route onto the diagnostic. The container is spelled `DoseQuantity`
    // rather than `Dose` because that is the recognized name: with `Dose` the
    // dose is never matched, no warning fires, and this slot would silently
    // stop probing anything.
    plant: (m) =>
      scriptMessage(
        `<NewRx><MedicationPrescribed><DrugDescription>Synthetic Tablet</DrugDescription>` +
          `<Sig><SigText>Take one daily.</SigText><Instruction><DoseAdministration>` +
          `<DoseQuantity><${m}/></DoseQuantity>` +
          `<Route><Text>by mouth</Text></Route>` +
          `</DoseAdministration></Instruction></Sig>` +
          `</MedicationPrescribed></NewRx>`,
      ),
    expectCode: SCRIPT_WARNING_CODES.SIG_AMBIGUOUS_DOSE,
  },

  // --- attribute values ------------------------------------------------
  {
    name: "/Message/@version (root version attribute)",
    plant: (m) => scriptMessage(newRxWithSig({}), m),
    expectCode: SCRIPT_WARNING_CODES.UNSUPPORTED_VERSION_TOLERATED,
  },
  {
    name: "/Message/Body/NewRx/MedicationPrescribed/@SchemaVersion (arbitrary attribute value)",
    plant: (m) => scriptMessage(newRxWithSig({ medAttr: m })),
    expectCode: SCRIPT_WARNING_CODES.SIG_STRUCTURED_LOSSY,
  },
  {
    name: "/Message/Body/NewRx//ProductCode/@Qualifier (code-system qualifier attribute)",
    plant: (m) =>
      scriptMessage(
        newRxWithSig({ productCode: "00000000001", productQualifier: m, strength: true }),
      ),
    expectCode: SCRIPT_WARNING_CODES.STRENGTH_CODED_AND_EXPLICIT,
  },

  // --- element values, including the ones that really are PHI ----------
  {
    name: "/Message/Body/Status/Code (response <Code> value)",
    plant: (m) =>
      scriptMessage(`<Error><Code>900</Code></Error><Status><Code>${m}</Code></Status>`),
    expectCode: SCRIPT_WARNING_CODES.RESPONSE_AMBIGUOUS_DISPOSITION,
  },
  {
    name: "/Message/Body/NewRx//ProductCode (drug product code / NDC slot)",
    plant: (m) => scriptMessage(newRxWithSig({ productCode: m, strength: true })),
    expectCode: SCRIPT_WARNING_CODES.STRENGTH_CODED_AND_EXPLICIT,
  },
  {
    name: "/Message/Body/NewRx//DrugDescription (drug description value)",
    plant: (m) => scriptMessage(newRxWithSig({ drugDescription: m })),
    expectCode: SCRIPT_WARNING_CODES.SIG_STRUCTURED_LOSSY,
  },
  {
    name: "/Message/Header/MessageID (routing identifier value)",
    plant: (m) =>
      `<?xml version="1.0" encoding="UTF-8"?><Message>` +
      `<Header><MessageID>${m}</MessageID></Header>` +
      `<Body>${newRxWithSig({})}</Body></Message>`,
    expectCode: SCRIPT_WARNING_CODES.VERSION_ABSENT,
  },
  {
    name: "/Message/Body/RxRenewalResponse//RequestReferenceNumber (Rx reference value)",
    plant: (m) =>
      scriptMessage(
        `<RxRenewalResponse><RequestReferenceNumber>${m}</RequestReferenceNumber>` +
          `<Response><Approved/><Denied/></Response></RxRenewalResponse>`,
      ),
    expectCode: SCRIPT_WARNING_CODES.LIFECYCLE_AMBIGUOUS_OUTCOME,
  },

  {
    name: "/Message/Body/NewRx/Patient//LastName (patient name value)",
    plant: (m) =>
      scriptMessage(
        `<NewRx><Patient><HumanPatient><Name><LastName>${m}</LastName></Name>` +
          `<DateOfBirth><Date>1900-01-01</Date></DateOfBirth></HumanPatient></Patient>` +
          newRxWithSig({}).replace(/^<NewRx>|<\/NewRx>$/g, "") +
          `</NewRx>`,
      ),
    expectCode: SCRIPT_WARNING_CODES.SIG_STRUCTURED_LOSSY,
  },
  {
    name: "/Message/Header/Version (version carried as an element, not an attribute)",
    plant: (m) =>
      `<?xml version="1.0" encoding="UTF-8"?><Message>` +
      `<Header><MessageID>SYNTH-MSG-0001</MessageID><Version>${m}</Version></Header>` +
      `<Body>${newRxWithSig({})}</Body></Message>`,
    expectCode: SCRIPT_WARNING_CODES.UNSUPPORTED_VERSION_TOLERATED,
  },

  // --- the whole document, when it is not XML at all --------------------
  {
    name: "raw input (no XML element at all)",
    plant: (m) => m,
    expectCode: SCRIPT_FATAL_CODES.NOT_XML,
  },
  {
    name: "raw input (DOCTYPE / ENTITY declaration refused)",
    plant: (m) => `<!DOCTYPE Message [<!ENTITY x "${m}">]><Message/>`,
    expectCode: SCRIPT_FATAL_CODES.NOT_XML,
  },
];

/** Everything but the slot table, so a probe can re-run the table one slot at a time. */
export const SCRIPT_SURFACE: Omit<DiagnosticSurfaceOptions<string, ScriptMessage>, "slots"> = {
  parse: (raw: string) => parseScript(raw),
  // parseScript has no strict mode: every deviation is a warning by design.
  parseStrict: null,
  getDiagnostics: (msg) => msg.warnings,
  // Structural identifiers only: the fields a downstream package would
  // interpolate to describe a LOCATION.
  //
  // `CodedValue.qualifier` is the judgement call in this list and is deliberately
  // EXCLUDED. It is read verbatim off the document and is unbounded, and the
  // argument for including it is real: it names a code system, which is the same
  // class of thing as the template OID and the CSV column name the ecosystem
  // audit counted as leaks. The argument against, which is the one taken: a locus
  // answers "where in the document", and a qualifier answers "in what code
  // system". It sits beside `code.value` (an NDC) as one half of a coded value,
  // and calling it structural would make the NDC structural too. A downstream
  // that wants a bounded code system reads `system`, which is a closed union.
  // `header.messageId`, drug codes and every Telecom field value are excluded on
  // the same reasoning, less arguably.
  getModelIdentifiers: (msg) => [
    msg.body.kind,
    ...(msg.body.kind === "unsupported" && msg.body.transaction !== undefined
      ? [msg.body.transaction]
      : []),
  ],
};

describe("SCRIPT diagnostic surfaces carry no consumer-controlled input", () => {
  it("leaks no declared slot into a message, a position, a thrown value, or the model", () => {
    assertNoDiagnosticPhiLeak<string, ScriptMessage>({ slots: SCRIPT_SLOTS, ...SCRIPT_SURFACE });
  });

  /**
   * The slot-table gate can only catch a leak through a slot somebody declared.
   * This one is slot-independent: if a message is byte-identical to its registry
   * entry, then no interpolation happened, wherever a marker landed and whether
   * or not it was 4 bytes long or re-encoded on the way.
   */
  it("renders every warning message exactly as its frozen registry entry", () => {
    const docs = [
      scriptMessage("<SyntheticUnmodeled/>"),
      scriptMessage("<Status><Description>x</Description></Status>"),
      scriptMessage(newRxWithSig({ productCode: "00000000001", strength: true })),
      scriptMessage(newRxWithSig({ emptyDose: true })),
      scriptMessage("<Error><Code>900</Code></Error><Status><Code>010</Code></Status>"),
      scriptMessage(newRxWithSig({}), "2099001"),
      `<Message><Body>${newRxWithSig({})}</Body></Message>`,
      scriptMessage(
        "<RxRenewalResponse><Response><Approved/><Denied/></Response></RxRenewalResponse>",
      ),
      scriptMessage("<RxRenewalResponse><Response><Note>x</Note></Response></RxRenewalResponse>"),
    ];
    const seen = new Set<ScriptWarningCode>();
    for (const doc of docs) {
      for (const w of parseScript(doc).warnings) {
        seen.add(w.code);
        expect(w.message).toBe(SCRIPT_WARNING_MESSAGES[w.code]);
      }
    }
    // The identity assertion is only worth something over the codes it saw, so
    // assert the corpus reached all of them rather than trusting that it did.
    expect([...seen].sort()).toEqual(Object.values(SCRIPT_WARNING_CODES).sort());
  });
});

/** Every position a Telecom sender controls. The table is the deliverable. */
export const TELECOM_SLOTS: DiagnosticSlot<string>[] = [
  // --- structural identifiers: segment and field ids --------------------
  {
    name: "Segment Identification 111-AM (segment id value)",
    plant: (m) => requestTransmission({}, [segment("07", [["D2", "RX0000001"]]), segment(m, [])]),
    expectCode: TELECOM_WARNING_CODES.MALFORMED_SEGMENT_ID,
  },
  {
    name: "field token with an unmodeled 2-char id and a long value",
    plant: (m) => requestTransmission({}, [segment("99", [["ZZ", m]])]),
    expectCode: TELECOM_WARNING_CODES.UNKNOWN_SEGMENT,
  },
  {
    name: "first field of a segment is not AM (segment id unreadable)",
    plant: (m) => requestTransmission({}, [[`D2${m}`, "ZZSYNTH"].join(FS)]),
    expectCode: TELECOM_WARNING_CODES.MISSING_SEGMENT_ID,
  },
  {
    name: "field token too short to carry an id (malformed field)",
    plant: (m) => requestTransmission({}, [rawSegment("99", ["X", `ZZ${m}`])]),
    expectCode: TELECOM_WARNING_CODES.MALFORMED_FIELD,
  },

  // --- fixed Transaction Header slots ----------------------------------
  {
    name: "Processor Control Number 104-A4 (fixed header)",
    plant: (m) => requestTransmission({ pcn: m }, [UNKNOWN_SEGMENT_99]),
    expectCode: TELECOM_WARNING_CODES.UNKNOWN_SEGMENT,
  },
  {
    name: "BIN Number 101-A1 (fixed header, 6 chars wide)",
    plant: (m) => requestTransmission({ bin: m }, [UNKNOWN_SEGMENT_99]),
    expectCode: TELECOM_WARNING_CODES.UNKNOWN_SEGMENT,
  },
  {
    name: "Date of Service 401-D1 (fixed header)",
    plant: (m) => requestTransmission({ dateOfService: m }, [UNKNOWN_SEGMENT_99]),
    expectCode: TELECOM_WARNING_CODES.UNKNOWN_SEGMENT,
  },
  {
    name: "Service Provider ID 201-B1 (fixed header)",
    plant: (m) => requestTransmission({ providerId: m }, [UNKNOWN_SEGMENT_99]),
    expectCode: TELECOM_WARNING_CODES.UNKNOWN_SEGMENT,
  },
  {
    name: "Software Vendor / Certification ID 110-AK (fixed header)",
    plant: (m) => requestTransmission({ softwareId: m }, [UNKNOWN_SEGMENT_99]),
    expectCode: TELECOM_WARNING_CODES.UNKNOWN_SEGMENT,
  },

  // --- request-side value slots ----------------------------------------
  {
    name: "Product / Service ID 407-D7 (NDC slot)",
    plant: (m) =>
      requestTransmission({}, [
        segment("07", [
          ["D2", "RX0000001"],
          ["E1", "03"],
          ["D7", m],
        ]),
        UNKNOWN_SEGMENT_99,
      ]),
    expectCode: TELECOM_WARNING_CODES.UNKNOWN_SEGMENT,
  },
  {
    name: "Prescription / Service Reference Number 402-D2 (Rx number slot)",
    plant: (m) => requestTransmission({}, [segment("07", [["D2", m]]), UNKNOWN_SEGMENT_99]),
    expectCode: TELECOM_WARNING_CODES.UNKNOWN_SEGMENT,
  },
  {
    name: "Cardholder ID 302-C2 (member id slot)",
    plant: (m) => requestTransmission({}, [segment("04", [["C2", m]]), UNKNOWN_SEGMENT_99]),
    expectCode: TELECOM_WARNING_CODES.UNKNOWN_SEGMENT,
  },
  {
    name: "Group ID 301-C1 (group id slot)",
    plant: (m) => requestTransmission({}, [segment("04", [["C1", m]]), UNKNOWN_SEGMENT_99]),
    expectCode: TELECOM_WARNING_CODES.UNKNOWN_SEGMENT,
  },
  {
    name: "Prescriber ID 411-DB (prescriber slot)",
    plant: (m) => requestTransmission({}, [segment("03", [["DB", m]]), UNKNOWN_SEGMENT_99]),
    expectCode: TELECOM_WARNING_CODES.UNKNOWN_SEGMENT,
  },
  {
    name: "Reason For Service Code 439-E4 (request DUR)",
    plant: (m) => requestTransmission({}, [segment("08", [["E4", m]])]),
    expectCode: TELECOM_WARNING_CODES.UNKNOWN_DUR_REASON,
  },
  {
    name: "Compound Product ID 489-TE, with a declared/decoded count mismatch",
    plant: (m) =>
      requestTransmission({}, [
        segment("10", [
          ["EC", "3"],
          ["RE", "03"],
          ["TE", m],
          ["ED", "0010000"],
        ]),
      ]),
    expectCode: TELECOM_WARNING_CODES.COMPOUND_COUNT_MISMATCH,
  },
  {
    name: "Other Payer ID 340-7C, with a declared/decoded COB count mismatch",
    plant: (m) =>
      requestTransmission({}, [
        segment("05", [
          ["4C", "3"],
          ["5C", "01"],
          ["7C", m],
          ["DV", "0004000"],
        ]),
      ]),
    expectCode: TELECOM_WARNING_CODES.COB_COUNT_MISMATCH,
  },
  {
    name: "Other Payer Processor Control Number 991-MH, on a COB count mismatch",
    plant: (m) =>
      requestTransmission({}, [
        segment("05", [
          ["4C", "3"],
          ["5C", "01"],
          ["7C", "PRIMARY01"],
          ["MH", m],
        ]),
      ]),
    expectCode: TELECOM_WARNING_CODES.COB_COUNT_MISMATCH,
  },
  {
    name: "Other Payer Group ID 992-MJ, on a COB count mismatch",
    plant: (m) =>
      requestTransmission({}, [
        segment("05", [
          ["4C", "3"],
          ["5C", "01"],
          ["7C", "PRIMARY01"],
          ["MJ", m],
        ]),
      ]),
    expectCode: TELECOM_WARNING_CODES.COB_COUNT_MISMATCH,
  },
  {
    name: "Prior Authorization Number Submitted 462-EV",
    plant: (m) =>
      requestTransmission({}, [
        segment("12", [
          ["EU", "1"],
          ["EV", m],
        ]),
        UNKNOWN_SEGMENT_99,
      ]),
    expectCode: TELECOM_WARNING_CODES.UNKNOWN_SEGMENT,
  },
  {
    name: "a second GS-delimited transaction (truncated)",
    plant: (m) =>
      requestHeader({}) + segment("07", [["D2", "RX0000001"]]) + GS + segment("07", [["D2", m]]),
    expectCode: TELECOM_WARNING_CODES.MULTI_TRANSACTION_TRUNCATED,
  },

  // --- response-side value slots ---------------------------------------
  {
    name: "Transaction Response Status 112-AN (unmodeled status value)",
    plant: (m) => responseTransmission([segment("21", [["AN", m]])]),
    expectCode: TELECOM_WARNING_CODES.UNKNOWN_RESPONSE_STATUS,
  },
  {
    name: "Reject Code 511-FB (unrecognized reject value)",
    plant: (m) =>
      responseTransmission([
        segment("21", [
          ["AN", "R"],
          ["FB", m],
        ]),
      ]),
    expectCode: TELECOM_WARNING_CODES.UNKNOWN_REJECT_CODE,
  },
  {
    name: "Additional Message Information 526-FQ, on a status/reject conflict",
    plant: (m) =>
      responseTransmission([
        segment("21", [
          ["AN", "P"],
          ["FB", "70"],
          ["FQ", m],
        ]),
      ]),
    expectCode: TELECOM_WARNING_CODES.STATUS_CONFLICT,
  },
  {
    name: "DUR Free Text Message 544-FY (response DUR)",
    plant: (m) =>
      responseTransmission([
        segment("21", [["AN", "ZZ"]]),
        segment("24", [
          ["E4", "88"],
          ["FY", m],
        ]),
      ]),
    expectCode: TELECOM_WARNING_CODES.UNKNOWN_RESPONSE_STATUS,
  },

  // --- fatal paths -------------------------------------------------------
  {
    name: "raw input shorter than the fixed Transaction Header",
    plant: (m) => m.slice(0, 20),
    expectCode: TELECOM_FATAL_CODES.NO_HEADER,
  },
  {
    name: "raw input with an unrecognizable version stamp",
    plant: (m) => `999999ZZ${m}`.padEnd(60, "0"),
    expectCode: TELECOM_FATAL_CODES.UNSUPPORTED_VERSION,
  },
  {
    name: "raw input carrying a body with no FS/GS/RS framing at all",
    plant: (m) => requestHeader({}) + m,
    expectCode: TELECOM_FATAL_CODES.INVALID_FRAMING,
  },
  {
    name: "F6 version stamp (recognized, not decoded)",
    plant: (m) => `999999F6B1${m}`.padEnd(60, "0") + FS + m,
    expectCode: TELECOM_WARNING_CODES.VF6_NOT_DECODED,
  },
];

/** Everything but the slot table, so a probe can re-run the table one slot at a time. */
export const TELECOM_SURFACE: Omit<
  DiagnosticSurfaceOptions<string, TelecomTransaction>,
  "slots"
> = {
  parse: (raw: string) => parseTelecom(raw),
  // parseTelecom has no strict mode: every deviation is a warning by design.
  parseStrict: null,
  getDiagnostics: (tx) => tx.warnings,
  // Structural identifiers only. Field VALUES (the NDC, the Rx number, the
  // cardholder id) are what this model exists to carry and are not loci.
  getModelIdentifiers: (tx) => [
    tx.kind,
    ...tx.segments.flatMap((s) => [
      s.segmentId,
      ...(s.name === undefined ? [] : [s.name]),
      ...s.fields.flatMap((f) => [f.id, ...(f.name === undefined ? [] : [f.name])]),
    ]),
  ],
};

describe("Telecom diagnostic surfaces carry no consumer-controlled input", () => {
  it("leaks no declared slot into a message, a position, a thrown value, or the model", () => {
    assertNoDiagnosticPhiLeak<string, TelecomTransaction>({
      slots: TELECOM_SLOTS,
      ...TELECOM_SURFACE,
    });
  });

  it("renders every warning message exactly as its frozen registry entry", () => {
    const inputs = [
      requestTransmission({}, [segment("99", [["ZZ", "SYNTH"]])]),
      requestTransmission({}, [segment("ZZZZ", [["ZZ", "SYNTH"]])]),
      requestTransmission({}, [["D2RX0000001", "ZZSYNTH"].join(FS)]),
      requestTransmission({}, [rawSegment("99", ["X", "ZZSYNTH"])]),
      requestTransmission({}, [segment("08", [["E4", "ZZ"]])]),
      requestTransmission({}, [
        segment("10", [
          ["EC", "3"],
          ["RE", "03"],
          ["TE", "00000000001"],
        ]),
      ]),
      requestTransmission({}, [
        segment("05", [
          ["4C", "3"],
          ["5C", "01"],
          ["7C", "PRIMARY01"],
        ]),
      ]),
      requestHeader({}) + segment("07", [["D2", "RX0000001"]]) + GS + segment("07", []),
      responseTransmission([segment("21", [["AN", "ZZ"]])]),
      responseTransmission([
        segment("21", [
          ["AN", "R"],
          ["FB", "ZZ"],
        ]),
      ]),
      responseTransmission([
        segment("21", [
          ["AN", "P"],
          ["FB", "70"],
        ]),
      ]),
      `999999F6B1${"0".repeat(50)}${FS}ZZSYNTH`,
    ];
    const seen = new Set<TelecomWarningCode>();
    for (const raw of inputs) {
      for (const w of parseTelecom(raw).warnings) {
        seen.add(w.code);
        expect(w.message).toBe(TELECOM_WARNING_MESSAGES[w.code]);
      }
    }
    expect([...seen].sort()).toEqual(Object.values(TELECOM_WARNING_CODES).sort());
  });
});
