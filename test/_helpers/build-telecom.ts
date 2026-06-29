/**
 * Synthetic NCPDP Telecommunication-standard message builders for the accuracy
 * corpus. Every value here is fabricated — no real BIN/PCN/NDC/cardholder. The
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
