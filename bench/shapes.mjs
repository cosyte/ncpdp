// The inputs of the @cosyte/ncpdp bench, built in code from an index. No file is read, and every
// name, identifier, code and amount here is made up: no real patient, prescriber, pharmacy, payer,
// BIN, cardholder or prescription.
//
// Five shapes, in the forms real traffic has:
// - `newRx(i)`: one SCRIPT NewRx of about 3 KiB, with a structured sig: what a prescriber's system
//   sends a pharmacy all day;
// - `medicationHistory(i, entries)`: one SCRIPT RxHistoryResponse carrying `entries` dispensed
//   medications, the long medication history a pharmacy or a prescriber asks for;
// - `noteNewRx(i, bytes)`: a NewRx whose medication note carries one large base64 value, a stand-in
//   for a large opaque payload inside a SCRIPT message;
// - `b1Claim(i)`: one Telecom B1 transmission with one claim, about 400 bytes: what a pharmacy
//   system sends a processor for every fill;
// - `b1Batch(claims)`: many B1 claims as a batch processor hands them over, four claims to a
//   transmission. Batch framing is not decoded by this package, so a batch is the list of its
//   transmissions.
// `newRxInput` and `b1Request` are the same messages as the plain objects a builder takes.

export const KIB = 1024;

/** Field Separator (0x1C). */
const FS = "\x1c";
/** Group Separator (0x1D): introduces each transaction. */
const GS = "\x1d";
/** Segment Separator (0x1E). */
const RS = "\x1e";

/** A string of `width` characters: `value` cut or padded with spaces. */
function pad(value, width) {
  return value.padEnd(width).slice(0, width);
}

/** `n` written in `width` digits, wrapping so it never grows past them. */
function digits(n, width) {
  return String(n % 10 ** width).padStart(width, "0");
}

// A few made-up drugs, so a history is not one line repeated. The product codes are not real NDCs.
const DRUGS = [
  { description: "Synthetic Amoxicillin 500 MG Oral Capsule", form: "C48480", per: "capsule" },
  { description: "Synthetic Lisinopril 10 MG Oral Tablet", form: "C48542", per: "tablet" },
  { description: "Synthetic Metformin 500 MG Oral Tablet", form: "C48542", per: "tablet" },
  { description: "Synthetic Atorvastatin 20 MG Oral Tablet", form: "C48542", per: "tablet" },
  { description: "Synthetic Albuterol 90 MCG Inhaler", form: "C48501", per: "puff" },
];

/** A made-up 11-digit product code for drug `k` of fill `i`. */
function productCode(i, k) {
  return `99${digits(i, 5)}${digits(k, 4)}`;
}

function sigText(drug) {
  return `Take 1 ${drug.per} by mouth twice daily.`;
}

/** A date in 2026 from an index, as SCRIPT writes it. */
function scriptDate(i) {
  return `2026-${digits((i % 12) + 1, 2)}-${digits((i % 28) + 1, 2)}`;
}

/** The SCRIPT header every message here carries. */
function header(kind, i) {
  const id = digits(i, 6);
  return (
    `  <Header>\n` +
    `    <To>SYNTHPHARM${id}</To>\n` +
    `    <From>SYNTHPRESC${id}</From>\n` +
    `    <MessageID>SYNTH-${kind}-${id}</MessageID>\n` +
    `    <SentTime>2026-01-15T09:30:00Z</SentTime>\n` +
    `    <PrescriberOrderNumber>SYNTH-ORDER-${id}</PrescriberOrderNumber>\n` +
    `  </Header>\n`
  );
}

function patient(i, indent) {
  return (
    `${indent}<Patient>\n` +
    `${indent}  <HumanPatient>\n` +
    `${indent}    <Name>\n` +
    `${indent}      <LastName>Testpatient</LastName>\n` +
    `${indent}      <FirstName>Avery${digits(i, 4)}</FirstName>\n` +
    `${indent}    </Name>\n` +
    `${indent}    <Gender>F</Gender>\n` +
    `${indent}    <DateOfBirth>\n` +
    `${indent}      <Date>1990-04-12</Date>\n` +
    `${indent}    </DateOfBirth>\n` +
    `${indent}  </HumanPatient>\n` +
    `${indent}</Patient>\n`
  );
}

function pharmacy(i, indent) {
  return (
    `${indent}<Pharmacy>\n` +
    `${indent}  <Identification>\n` +
    `${indent}    <NCPDPID>99${digits(i, 5)}</NCPDPID>\n` +
    `${indent}    <NPI>19${digits(i, 8)}</NPI>\n` +
    `${indent}  </Identification>\n` +
    `${indent}  <BusinessName>Synthetic Community Pharmacy ${digits(i, 3)}</BusinessName>\n` +
    `${indent}</Pharmacy>\n`
  );
}

function prescriber(i, indent) {
  return (
    `${indent}<Prescriber>\n` +
    `${indent}  <NonVeterinarian>\n` +
    `${indent}    <Identification>\n` +
    `${indent}      <NPI>18${digits(i, 8)}</NPI>\n` +
    `${indent}    </Identification>\n` +
    `${indent}    <Name>\n` +
    `${indent}      <LastName>Testprescriber</LastName>\n` +
    `${indent}      <FirstName>Jordan</FirstName>\n` +
    `${indent}    </Name>\n` +
    `${indent}  </NonVeterinarian>\n` +
    `${indent}</Prescriber>\n`
  );
}

/** A structured sig with its coded parts, as the package's structured-sig fixtures carry it. */
function structuredSig(drug, indent) {
  return (
    `${indent}<Sig>\n` +
    `${indent}  <SigText>${sigText(drug)}</SigText>\n` +
    `${indent}  <CodeSystem>SNOMED</CodeSystem>\n` +
    `${indent}  <Instruction>\n` +
    `${indent}    <DoseAdministration>\n` +
    `${indent}      <DoseDeliveryMethod>\n` +
    `${indent}        <Text>Take</Text>\n` +
    `${indent}        <Code>419652001</Code>\n` +
    `${indent}        <Qualifier>SNOMED</Qualifier>\n` +
    `${indent}      </DoseDeliveryMethod>\n` +
    `${indent}      <Dose>\n` +
    `${indent}        <DoseQuantity>1</DoseQuantity>\n` +
    `${indent}        <DoseUnitOfMeasure>\n` +
    `${indent}          <Text>${drug.per}</Text>\n` +
    `${indent}          <Code>${drug.form}</Code>\n` +
    `${indent}          <Qualifier>NCI</Qualifier>\n` +
    `${indent}        </DoseUnitOfMeasure>\n` +
    `${indent}      </Dose>\n` +
    `${indent}    </DoseAdministration>\n` +
    `${indent}    <RouteOfAdministration>\n` +
    `${indent}      <Text>by mouth</Text>\n` +
    `${indent}      <Code>26643006</Code>\n` +
    `${indent}      <Qualifier>SNOMED</Qualifier>\n` +
    `${indent}    </RouteOfAdministration>\n` +
    `${indent}    <AdministrationTiming>\n` +
    `${indent}      <Text>twice daily</Text>\n` +
    `${indent}    </AdministrationTiming>\n` +
    `${indent}  </Instruction>\n` +
    `${indent}</Sig>\n`
  );
}

/** The prescribed medication of a NewRx; `note` is the text of its note. */
function medicationPrescribed(i, note) {
  const drug = DRUGS[i % DRUGS.length];
  const m = "        ";
  return (
    `      <MedicationPrescribed>\n` +
    `${m}<DrugDescription>${drug.description}</DrugDescription>\n` +
    `${m}<DrugCoded>\n` +
    `${m}  <ProductCode Qualifier="ND">${productCode(i, 0)}</ProductCode>\n` +
    `${m}</DrugCoded>\n` +
    `${m}<Quantity>\n` +
    `${m}  <Value>60</Value>\n` +
    `${m}  <CodeListQualifier>38</CodeListQualifier>\n` +
    `${m}  <QuantityUnitOfMeasure>\n` +
    `${m}    <Code>${drug.form}</Code>\n` +
    `${m}  </QuantityUnitOfMeasure>\n` +
    `${m}</Quantity>\n` +
    `${m}<DaysSupply>30</DaysSupply>\n` +
    `${m}<Substitutions>0</Substitutions>\n` +
    `${m}<NumberOfRefills>2</NumberOfRefills>\n` +
    `${m}<WrittenDate>\n` +
    `${m}  <Date>${scriptDate(i)}</Date>\n` +
    `${m}</WrittenDate>\n` +
    structuredSig(drug, m) +
    `${m}<Note>${note}</Note>\n` +
    `      </MedicationPrescribed>\n`
  );
}

function newRxMessage(i, note) {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Message xmlns="http://www.ncpdp.org/schema/SCRIPT" version="2017071">\n` +
    header("NEWRX", i) +
    `  <Body>\n` +
    `    <NewRx>\n` +
    patient(i, "      ") +
    pharmacy(i, "      ") +
    prescriber(i, "      ") +
    medicationPrescribed(i, note) +
    `    </NewRx>\n` +
    `  </Body>\n` +
    `</Message>\n`
  );
}

/** One synthetic NewRx, about 3 KiB, with a structured sig. */
export function newRx(i) {
  return newRxMessage(i, "Synthetic test note, no real patient.");
}

/**
 * `bytes` generated bytes, base64: a stand-in for an opaque payload. A fixed linear congruential
 * sequence, so every run builds the same bytes and no file is read.
 */
function base64Payload(bytes, seed) {
  const data = Buffer.alloc(bytes);
  let state = (seed * 2654435761 + 1) >>> 0;
  for (let k = 0; k < bytes; k++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    data[k] = state >>> 24;
  }
  return data.toString("base64");
}

/**
 * A NewRx of about `bytes` bytes whose medication note carries one base64 value: one large text
 * node, the shape of a message that reaches a megabyte with one value rather than many elements.
 */
export function noteNewRx(i, bytes) {
  const frame = newRxMessage(i, "").length;
  // Base64 writes four characters for every three bytes; rounding up keeps the message at least
  // `bytes` long.
  const payload = Math.max(3, Math.ceil((bytes - frame) / 4) * 3);
  return newRxMessage(i, base64Payload(payload, i));
}

/** The plain object `buildNewRx` takes for the NewRx `newRx(i)` writes, without its structured sig. */
export function newRxInput(i, note = "Synthetic test note, no real patient.") {
  const drug = DRUGS[i % DRUGS.length];
  const id = digits(i, 6);
  return {
    header: {
      version: "2017071",
      to: `SYNTHPHARM${id}`,
      from: `SYNTHPRESC${id}`,
      messageId: `SYNTH-NEWRX-${id}`,
      sentTime: "2026-01-15T09:30:00Z",
      prescriberOrderNumber: `SYNTH-ORDER-${id}`,
    },
    patient: {
      name: { lastName: "Testpatient", firstName: `Avery${digits(i, 4)}` },
      gender: "F",
      dateOfBirth: "1990-04-12",
    },
    pharmacy: {
      businessName: `Synthetic Community Pharmacy ${digits(i, 3)}`,
      identification: { ncpdpId: `99${digits(i, 5)}`, npi: `19${digits(i, 8)}` },
    },
    prescriber: {
      name: { lastName: "Testprescriber", firstName: "Jordan" },
      identification: { npi: `18${digits(i, 8)}` },
    },
    medication: {
      description: drug.description,
      quantity: {
        value: { source: "60", isValid: true },
        codeListQualifier: "38",
        unitOfMeasure: drug.form,
      },
      daysSupply: { source: "30", isValid: true },
      substitutions: "0",
      numberOfRefills: "2",
      writtenDate: scriptDate(i),
      sigText: sigText(drug),
      note,
    },
  };
}

/** The `buildNewRx` input for the message `noteNewRx(i, bytes)` writes. */
export function noteNewRxInput(i, bytes) {
  const frame = newRxMessage(i, "").length;
  const payload = Math.max(3, Math.ceil((bytes - frame) / 4) * 3);
  return newRxInput(i, base64Payload(payload, i));
}

/** One dispensed medication of a history. */
function medicationDispensed(i, k) {
  const drug = DRUGS[k % DRUGS.length];
  const m = "      ";
  return (
    `      <MedicationDispensed>\n` +
    `${m}  <DrugDescription>${drug.description}</DrugDescription>\n` +
    `${m}  <DrugCoded>\n` +
    `${m}    <ProductCode Qualifier="ND">${productCode(i, k)}</ProductCode>\n` +
    `${m}  </DrugCoded>\n` +
    `${m}  <Quantity>\n` +
    `${m}    <Value>${String(30 + (k % 3) * 30)}</Value>\n` +
    `${m}    <CodeListQualifier>38</CodeListQualifier>\n` +
    `${m}    <QuantityUnitOfMeasure>\n` +
    `${m}      <Code>${drug.form}</Code>\n` +
    `${m}    </QuantityUnitOfMeasure>\n` +
    `${m}  </Quantity>\n` +
    `${m}  <DaysSupply>30</DaysSupply>\n` +
    `${m}  <WrittenDate>\n` +
    `${m}    <Date>${scriptDate(k)}</Date>\n` +
    `${m}  </WrittenDate>\n` +
    `${m}  <LastFillDate>\n` +
    `${m}    <Date>${scriptDate(k + 3)}</Date>\n` +
    `${m}  </LastFillDate>\n` +
    `${m}  <Sig>\n` +
    `${m}    <SigText>${sigText(drug)}</SigText>\n` +
    `${m}  </Sig>\n` +
    pharmacy(k, `${m}  `) +
    prescriber(k, `${m}  `) +
    `      </MedicationDispensed>\n`
  );
}

/**
 * A SCRIPT RxHistoryResponse for one patient carrying `entries` dispensed medications, each with
 * its drug, quantity, dates, sig, pharmacy and prescriber: about 1.1 KiB an entry.
 */
export function medicationHistory(i, entries) {
  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>\n`,
    `<Message xmlns="http://www.ncpdp.org/schema/SCRIPT" version="2017071">\n`,
    header("HIST", i),
    `  <Body>\n`,
    `    <RxHistoryResponse>\n`,
    patient(i, "      "),
  ];
  for (let k = 0; k < entries; k++) parts.push(medicationDispensed(i, k));
  parts.push(`    </RxHistoryResponse>\n`, `  </Body>\n`, `</Message>\n`);
  return parts.join("");
}

/** The fixed 56-byte D.0 request header. */
function telecomHeader(i, count) {
  return (
    pad("999999", 6) + // BIN
    pad("D0", 2) + // Version/Release
    pad("B1", 2) + // Transaction Code
    pad("PCN0000000", 10) + // Processor Control Number
    pad(String(count), 1) + // Transaction Count
    pad("01", 2) + // Service Provider ID Qualifier
    pad(`10${digits(i, 8)}`, 15) + // Service Provider ID
    pad("20260115", 8) + // Date of Service
    pad("SW00000000", 10) // Software/Certification ID
  );
}

/** A segment on the wire: `AM` and its id, then each field as its 2-character id and value. */
function segment(id, fields) {
  return [`AM${id}`, ...fields.map(([fid, value]) => `${fid}${value}`)].join(FS);
}

/** The Insurance and Patient segments a transmission shares across its claims. */
function transmissionSegments(i) {
  return [
    {
      segmentId: "04",
      fields: [
        ["C2", `SYNTHCARD${digits(i, 4)}`],
        ["C1", "GRP900"],
        ["C3", "01"],
      ],
    },
    {
      segmentId: "01",
      fields: [
        ["C4", "19900412"],
        ["C5", "2"],
        ["CA", "AVERY"],
        ["CB", "TESTPATIENT"],
      ],
    },
  ];
}

/** The segments of claim `k`: Claim, Prescriber, DUR/PPS and Pricing. */
function claimSegments(i, k) {
  return [
    {
      segmentId: "07",
      fields: [
        ["EM", "1"],
        ["D2", `RX${digits(i, 4)}${digits(k, 5)}`],
        ["D3", "00"],
        ["E1", "03"],
        ["D7", productCode(i, k)],
        ["E7", "30000"],
        ["D5", "30"],
        ["D8", "0"],
        ["DE", "20260115"],
      ],
    },
    {
      segmentId: "03",
      fields: [
        ["EZ", "01"],
        ["DB", `18${digits(k, 8)}`],
      ],
    },
    {
      segmentId: "08",
      fields: [
        ["E4", "DD"],
        ["E5", "M0"],
        ["E6", "1A"],
      ],
    },
    {
      segmentId: "11",
      fields: [
        ["D9", "1250{"],
        ["DC", "150{"],
        ["DQ", "1600{"],
        ["DU", "1400{"],
        ["DN", "01"],
      ],
    },
  ];
}

function wireSegments(segments) {
  return segments.map((s) => segment(s.segmentId, s.fields)).join(RS);
}

/** A B1 transmission of `claims` claims, `first` the index of its first. */
function b1Transmission(i, first, claims) {
  let text = telecomHeader(i, claims) + wireSegments(transmissionSegments(i));
  for (let k = first; k < first + claims; k++) text += GS + wireSegments(claimSegments(i, k));
  return text;
}

/** One B1 transmission with one claim, about 400 bytes. */
export function b1Claim(i) {
  return b1Transmission(i, i, 1);
}

/**
 * `claims` B1 claims, four to a transmission, as the list of their transmissions. `seed` makes
 * batches of the same size differ.
 */
export function b1Batch(claims, seed = 0) {
  const out = [];
  for (let k = 0, t = seed * 10_000; k < claims; k += 4, t++) {
    out.push(b1Transmission(t, k, Math.min(4, claims - k)));
  }
  return out;
}

/**
 * One B1 transmission carrying `claims` claims. The header's count is one character, so a
 * transmission of more than four claims declares 4 and the parser warns: the shape the scaling
 * gate grows on its size axis, since no maximum is enforced.
 */
export function b1Wide(i, claims) {
  return telecomHeader(i, 4) + b1Transmission(i, 0, claims).slice(56);
}

/** The plain object `buildTelecomRequest` takes for one B1 claim, every segment in it. */
export function b1Request(i, k = i) {
  return {
    header: {
      binNumber: "999999",
      transactionCode: "B1",
      processorControlNumber: "PCN0000000",
      serviceProviderIdQualifier: "01",
      serviceProviderId: `10${digits(i, 8)}`,
      dateOfService: "20260115",
      softwareCertificationId: "SW00000000",
    },
    segments: [...transmissionSegments(i), ...claimSegments(i, k)].map((s) => ({
      segmentId: s.segmentId,
      fields: s.fields.map(([id, value]) => ({ id, value })),
    })),
  };
}

/** The builder inputs for the claims `b1Batch(claims, seed)` carries, one request each. */
export function b1Requests(claims, seed = 0) {
  return Array.from({ length: claims }, (_v, k) => b1Request(seed * 10_000 + Math.floor(k / 4), k));
}
