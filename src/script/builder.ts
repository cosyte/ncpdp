import { NcpdpScriptBuildError, SCRIPT_BUILD_CODES } from "../common/errors.js";
import type { ScriptHeader } from "./header.js";
import { ScriptMessage } from "./message.js";
import type { MedicationPrescribed, Patient, Pharmacy, Prescriber } from "./newrx.js";
import type { ResponseBody, ResponseKind } from "./response.js";

/** Characters illegal in XML 1.0 text (control chars other than tab/LF/CR). */
const ILLEGAL_XML_CHAR = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;

/**
 * Recursively assert that no string anywhere in `value` carries an
 * XML-1.0-illegal control character, which would make the emitted document
 * malformed. Throws {@link NcpdpScriptBuildError} with `INVALID_CHARACTER`.
 */
function assertCleanChars(value: unknown): void {
  if (typeof value === "string") {
    if (ILLEGAL_XML_CHAR.test(value)) {
      throw new NcpdpScriptBuildError(
        SCRIPT_BUILD_CODES.INVALID_CHARACTER,
        "A supplied value carries a control character that is illegal in XML 1.0 text.",
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertCleanChars(item);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) assertCleanChars(item);
  }
}

/** The SCRIPT `<Header>` fields a builder accepts; all optional. */
export interface ScriptHeaderInput {
  /** Declared SCRIPT version, emitted as the root `version` attribute. */
  readonly version?: string;
  readonly to?: string;
  readonly from?: string;
  readonly messageId?: string;
  readonly relatesToMessageId?: string;
  readonly sentTime?: string;
  readonly prescriberOrderNumber?: string;
}

function buildHeader(input: ScriptHeaderInput | undefined): ScriptHeader {
  const out: { -readonly [K in keyof ScriptHeader]: ScriptHeader[K] } = {};
  if (input === undefined) return out;
  if (input.version !== undefined) out.version = input.version;
  if (input.to !== undefined) out.to = input.to;
  if (input.from !== undefined) out.from = input.from;
  if (input.messageId !== undefined) out.messageId = input.messageId;
  if (input.relatesToMessageId !== undefined) out.relatesToMessageId = input.relatesToMessageId;
  if (input.sentTime !== undefined) out.sentTime = input.sentTime;
  if (input.prescriberOrderNumber !== undefined) {
    out.prescriberOrderNumber = input.prescriberOrderNumber;
  }
  return out;
}

/** Input to {@link buildNewRx}: routing header, optional parties, and the medication. */
export interface NewRxInput {
  readonly header?: ScriptHeaderInput;
  readonly patient?: Patient;
  readonly pharmacy?: Pharmacy;
  readonly prescriber?: Prescriber;
  /** The prescribed medication; a `description` is required. */
  readonly medication: MedicationPrescribed;
}

interface NewRxBody {
  kind: "NewRx";
  patient?: Patient;
  pharmacy?: Pharmacy;
  prescriber?: Prescriber;
  medication?: MedicationPrescribed;
}

/**
 * Build a spec-clean SCRIPT **NewRx** message. The conservative (emit) half of
 * Postel's Law: it refuses to construct a NewRx with no prescribed-medication
 * description ({@link SCRIPT_BUILD_CODES.MISSING_MEDICATION}) or carrying an
 * XML-illegal control character ({@link SCRIPT_BUILD_CODES.INVALID_CHARACTER}),
 * throwing {@link NcpdpScriptBuildError} rather than emitting an unusable message.
 *
 * The returned {@link ScriptMessage} serializes (via
 * {@link "./serialize".serializeScript} / `toString()`) to XML that re-parses with
 * zero warnings.
 *
 * @param input - The header, parties, and medication to build.
 * @returns A frozen {@link ScriptMessage} carrying a NewRx body.
 * @throws NcpdpScriptBuildError when the input cannot form a spec-clean NewRx.
 *
 * @example
 * ```ts
 * import { buildNewRx } from "@cosyte/ncpdp/script";
 * const msg = buildNewRx({
 *   header: { version: "2017071", messageId: "SYNTH-1" },
 *   medication: { description: "Amoxicillin 500 MG Oral Capsule" },
 * });
 * msg.toString(); // canonical SCRIPT XML
 * ```
 */
export function buildNewRx(input: NewRxInput): ScriptMessage {
  const description = input.medication.description?.trim() ?? "";
  if (description === "") {
    throw new NcpdpScriptBuildError(
      SCRIPT_BUILD_CODES.MISSING_MEDICATION,
      "A NewRx requires a prescribed medication with a description.",
    );
  }
  assertCleanChars(input);

  const body: NewRxBody = { kind: "NewRx", medication: input.medication };
  if (input.patient !== undefined) body.patient = input.patient;
  if (input.pharmacy !== undefined) body.pharmacy = input.pharmacy;
  if (input.prescriber !== undefined) body.prescriber = input.prescriber;

  return new ScriptMessage({ header: buildHeader(input.header), body, warnings: [] });
}

/** Input to {@link buildScriptResponse}: the response kind, its code, and optional detail. */
export interface ScriptResponseInput {
  /** Which response transaction to build. */
  readonly kind: ResponseKind;
  /** The primary response `<Code>`; required (a response must carry one). */
  readonly code: string;
  readonly descriptionCode?: string;
  readonly description?: string;
  readonly header?: ScriptHeaderInput;
}

function responseBody(input: ScriptResponseInput): ResponseBody {
  const fields: { code: string; descriptionCode?: string; description?: string } = {
    code: input.code,
  };
  if (input.descriptionCode !== undefined) fields.descriptionCode = input.descriptionCode;
  if (input.description !== undefined) fields.description = input.description;
  switch (input.kind) {
    case "Status":
      return { kind: "Status", ...fields };
    case "Error":
      return { kind: "Error", ...fields };
    case "Verify":
      return { kind: "Verify", ...fields };
  }
}

/**
 * Build a spec-clean SCRIPT response (`<Status>`/`<Error>`/`<Verify>`) message.
 * Refuses to construct a response with no `<Code>`
 * ({@link SCRIPT_BUILD_CODES.MISSING_RESPONSE_CODE}) — the one field the parser
 * itself flags as required — or an XML-illegal control character
 * ({@link SCRIPT_BUILD_CODES.INVALID_CHARACTER}).
 *
 * @param input - The response kind, code, optional description, and header.
 * @returns A frozen {@link ScriptMessage} carrying the response body.
 * @throws NcpdpScriptBuildError when the input cannot form a spec-clean response.
 *
 * @example
 * ```ts
 * import { buildScriptResponse } from "@cosyte/ncpdp/script";
 * const ack = buildScriptResponse({
 *   kind: "Status",
 *   code: "010",
 *   header: { relatesToMessageId: "SYNTH-1" },
 * });
 * ack.disposition; // "success"
 * ```
 */
export function buildScriptResponse(input: ScriptResponseInput): ScriptMessage {
  if (input.code.trim() === "") {
    throw new NcpdpScriptBuildError(
      SCRIPT_BUILD_CODES.MISSING_RESPONSE_CODE,
      `A SCRIPT <${input.kind}> response requires a <Code>.`,
    );
  }
  assertCleanChars(input);

  return new ScriptMessage({
    header: buildHeader(input.header),
    body: responseBody(input),
    warnings: [],
  });
}
