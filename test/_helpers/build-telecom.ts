/**
 * Synthetic NCPDP Telecommunication-standard message builders for the accuracy
 * corpus. Every value here is fabricated: no real BIN/PCN/NDC/cardholder. The
 * builders assemble the control-character framing (FS/GS/RS) so test fixtures
 * stay readable as code rather than opaque binary files.
 */

/** Field Separator (0x1C). */
export const FS = "\x1c";
/** Group Separator (0x1D). */
export const GS = "\x1d";
/** Segment Separator (0x1E). */
export const RS = "\x1e";

function pad(value: string, length: number): string {
  return value.padEnd(length).slice(0, length);
}

/** Fields of the fixed D.0 Transaction Header, all synthetic. */
export interface HeaderParts {
  readonly bin?: string;
  readonly version?: string;
  readonly transactionCode?: string;
  readonly pcn?: string;
  readonly transactionCount?: string;
  readonly providerQualifier?: string;
  readonly providerId?: string;
  readonly dateOfService?: string;
  readonly softwareId?: string;
}

/**
 * Build the fixed 56-byte D.0 Transaction Header from synthetic parts. Omitted
 * fields fall back to fabricated defaults.
 */
export function buildHeader(parts: HeaderParts = {}): string {
  return (
    pad(parts.bin ?? "999999", 6) +
    pad(parts.version ?? "D0", 2) +
    pad(parts.transactionCode ?? "B1", 2) +
    pad(parts.pcn ?? "PCN0000000", 10) +
    pad(parts.transactionCount ?? "1", 1) +
    pad(parts.providerQualifier ?? "01", 2) +
    pad(parts.providerId ?? "1234567890", 15) +
    pad(parts.dateOfService ?? "20260629", 8) +
    pad(parts.softwareId ?? "SW00000000", 10)
  );
}

/** Fields of the fixed D.0 Response Transaction Header, all synthetic. */
export interface ResponseHeaderParts {
  readonly version?: string;
  readonly transactionCode?: string;
  readonly transactionCount?: string;
  readonly headerResponseStatus?: string;
  readonly providerQualifier?: string;
  readonly providerId?: string;
}

/**
 * Build the fixed D.0 Response Transaction Header from synthetic parts. The
 * response header leads with the Version/Release (offset 0), unlike the request
 * header which leads with the BIN.
 */
export function buildResponseHeader(parts: ResponseHeaderParts = {}): string {
  return (
    pad(parts.version ?? "D0", 2) +
    pad(parts.transactionCode ?? "B1", 2) +
    pad(parts.transactionCount ?? "1", 1) +
    pad(parts.headerResponseStatus ?? "A", 1) +
    pad(parts.providerQualifier ?? "01", 2) +
    pad(parts.providerId ?? "1234567890", 15)
  );
}

/**
 * Build a full response transmission: the fixed response header, a Group
 * Separator introducing the transaction, then the RS-joined response segments.
 * The leading GS is the structural boundary the parser uses to split the fixed
 * header from the framed segment body.
 */
export function buildResponseTransmission(
  header: ResponseHeaderParts,
  segments: readonly SegmentParts[],
): string {
  return buildResponseHeader(header) + GS + buildTransaction(segments);
}

/**
 * Build a response transmission carrying one or more GS-separated transactions:
 * the fixed response header, then each transaction introduced by its own Group
 * Separator. A payer answering a multi-claim transmission answers each claim, so
 * the response side has the same framing as the request side.
 */
export function buildResponseTransmissions(
  header: ResponseHeaderParts,
  transactions: ReadonlyArray<readonly SegmentParts[]>,
): string {
  return buildResponseHeader(header) + transactions.map((t) => GS + buildTransaction(t)).join("");
}

/** A segment as id + ordered `[fieldId, value]` pairs. */
export interface SegmentParts {
  readonly id: string;
  readonly fields: ReadonlyArray<readonly [string, string]>;
}

/** Build one RS-free segment: `AM<id>` then FS-joined `<fieldId><value>` tokens. */
export function buildSegment(seg: SegmentParts): string {
  const tokens = [`AM${seg.id}`, ...seg.fields.map(([id, value]) => `${id}${value}`)];
  return tokens.join(FS);
}

/** Join segments with RS into a single transaction body. */
export function buildTransaction(segments: readonly SegmentParts[]): string {
  return segments.map(buildSegment).join(RS);
}

/** Build a full transmission: header + body (one or more GS-joined transactions). */
export function buildTransmission(
  header: HeaderParts,
  transactions: ReadonlyArray<readonly SegmentParts[]>,
): string {
  return buildHeader(header) + transactions.map(buildTransaction).join(GS);
}

/**
 * A synthetic compound B1 claim: a Claim segment plus a Compound segment (10)
 * listing three ingredients with the declared component count. All values
 * fabricated: no real NDCs.
 */
export function syntheticCompoundClaim(): string {
  return buildTransmission({ transactionCode: "B1" }, [
    [
      { id: "07", fields: [["D2", "RX0000002"]] },
      {
        id: "10",
        fields: [
          ["EF", "DF1"],
          ["EG", "2"],
          ["EC", "3"],
          ["RE", "03"],
          ["TE", "00000000001"],
          ["ED", "0010000"],
          ["EE", "0002500"],
          ["RE", "03"],
          ["TE", "00000000002"],
          ["ED", "0005000"],
          ["EE", "0001000"],
          ["RE", "03"],
          ["TE", "00000000003"],
          ["ED", "0002500"],
          ["EE", "0000500"],
        ],
      },
    ],
  ]);
}

/**
 * A synthetic secondary (COB) B1 claim: a Claim segment plus a Coordination of
 * Benefits / Other Payments segment (05) declaring one prior payer with an amount
 * paid and a patient-responsibility row. All values fabricated.
 */
export function syntheticSecondaryClaim(): string {
  return buildTransmission({ transactionCode: "B1" }, [
    [
      { id: "07", fields: [["D2", "RX0000003"]] },
      {
        id: "05",
        fields: [
          ["4C", "1"],
          ["5C", "01"],
          ["6C", "03"],
          ["7C", "PRIMARY01"],
          ["E8", "20260601"],
          ["HC", "07"],
          ["DV", "0004000"],
          ["6E", "05"],
          ["7E", "0001000"],
        ],
      },
    ],
  ]);
}

/**
 * The three transactions of the multi-transaction request corpus, carrying 2, 3
 * and 1 segments respectively so a reader can be checked per transaction rather
 * than over a flattened segment list. All values fabricated: three prescriptions
 * for one synthetic patient, the shape a pharmacy sends when it bills a visit's
 * claims in one transmission.
 */
export const MULTI_TRANSACTION_SEGMENTS: ReadonlyArray<readonly SegmentParts[]> = [
  [
    {
      id: "04",
      fields: [
        ["C2", "SYNTHCARD02"],
        ["C1", "GRP123"],
      ],
    },
    {
      id: "07",
      fields: [
        ["D2", "RX0000011"],
        ["D7", "00093123456"],
        ["E7", "30000"],
      ],
    },
  ],
  [
    { id: "01", fields: [["C4", "19800101"]] },
    {
      id: "04",
      fields: [["C2", "SYNTHCARD02"]],
    },
    {
      id: "07",
      fields: [
        ["D2", "RX0000012"],
        ["D7", "00093123457"],
        ["E7", "60000"],
      ],
    },
  ],
  [
    {
      id: "07",
      fields: [
        ["D2", "RX0000013"],
        ["D7", "00093123458"],
        ["E7", "90000"],
      ],
    },
  ],
];

/**
 * A synthetic three-transaction B1 request transmission, declaring `3` and
 * carrying 3 transactions with 2, 3 and 1 segments.
 */
export function syntheticMultiTransactionRequest(): string {
  return buildTransmission(
    { transactionCode: "B1", transactionCount: "3" },
    MULTI_TRANSACTION_SEGMENTS,
  );
}

/**
 * The same three-transaction transmission with a **malformed second
 * transaction**: its leading segment carries no `AM` Segment Identification and a
 * field token too short to hold a 2-character id. Transactions one and three are
 * byte-identical to the clean fixture, so a reader that isolates the failure can
 * be told from one that does not.
 */
export function syntheticMultiTransactionRequestMalformedSecond(): string {
  const first = MULTI_TRANSACTION_SEGMENTS[0] ?? [];
  const third = MULTI_TRANSACTION_SEGMENTS[2] ?? [];
  // Built raw rather than through `buildSegment`, which always writes an AM
  // field: the defect under test is a transaction whose segment has none.
  const malformed = ["D2RX0000012", "X"].join(FS);
  return (
    buildHeader({ transactionCode: "B1", transactionCount: "3" }) +
    [buildTransaction(first), malformed, buildTransaction(third)].join(GS)
  );
}

/**
 * A synthetic three-transaction **response** transmission: the payer's answer to
 * each of three submitted claims, one paid, one rejected, one paid.
 */
export function syntheticMultiTransactionResponse(): string {
  return buildResponseTransmissions({ transactionCode: "B1", transactionCount: "3" }, [
    [
      { id: "21", fields: [["AN", "P"]] },
      { id: "23", fields: [["F5", "0001250"]] },
    ],
    [
      {
        id: "21",
        fields: [
          ["AN", "R"],
          ["FB", "70"],
        ],
      },
    ],
    [
      { id: "21", fields: [["AN", "P"]] },
      { id: "23", fields: [["F5", "0000500"]] },
    ],
  ]);
}

/**
 * A synthetic nine-transaction B1 request declaring `9` and carrying 9. Nine is
 * deliberately past every transaction count any payer material describes: this
 * reader has no citable authority for a maximum, so it enforces none and this
 * fixture proves it.
 */
export function syntheticNineTransactionRequest(): string {
  const transactions = Array.from({ length: 9 }, (_unused, i) => [
    { id: "07", fields: [["D2", `RX000002${i}`] as const] },
  ]);
  return buildTransmission({ transactionCode: "B1", transactionCount: "9" }, transactions);
}

/**
 * A minimal-but-realistic synthetic B1 billing claim: Patient, Insurance, Claim
 * (with the safety fields), and Prescriber segments. All values fabricated.
 */
export function syntheticB1(): string {
  return buildTransmission({ transactionCode: "B1" }, [
    [
      {
        id: "01",
        fields: [
          ["C4", "19800101"],
          ["C5", "1"],
        ],
      },
      {
        id: "04",
        fields: [
          ["C2", "SYNTHCARD01"],
          ["C1", "GRP123"],
          ["C3", "01"],
        ],
      },
      {
        id: "07",
        fields: [
          ["EM", "1"],
          ["D2", "RX0000001"],
          ["D3", "00"],
          ["E1", "03"],
          ["D7", "00093123456"],
          ["E7", "30000"],
          ["D5", "30"],
          ["D8", "0"],
        ],
      },
      {
        id: "03",
        fields: [
          ["EZ", "01"],
          ["DB", "1700000000"],
        ],
      },
    ],
  ]);
}
