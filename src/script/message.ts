import { deepFreeze } from "../common/freeze.js";
import type { NcpdpScriptWarning } from "../common/warnings.js";
import type { NcpdpProfile } from "../profiles/types.js";
import type { ScriptHeader } from "./header.js";
import type { LifecycleRequest, LifecycleResponse } from "./lifecycle.js";
import type { NewRx } from "./newrx.js";
import {
  dispositionOf,
  type ErrorBody,
  type ResponseBody,
  type ResponseDisposition,
  type StatusBody,
  type VerifyBody,
} from "./response.js";
import { serializeScript } from "./serialize.js";

/**
 * A SCRIPT transaction body this phase recognizes but does not model. The raw
 * transaction name is surfaced so a consumer can branch, without the parser
 * pretending to understand it.
 */
export interface UnsupportedBody {
  readonly kind: "unsupported";
  /** The SCRIPT transaction element name (e.g. `RxRenewalRequest`). */
  readonly transaction: string;
}

/** The parsed body of a SCRIPT message. */
export type ScriptBody =
  | NewRx
  | ResponseBody
  | LifecycleRequest
  | LifecycleResponse
  | UnsupportedBody;

/**
 * An immutable parsed SCRIPT message: routing header, the typed body, and any
 * non-fatal warnings raised while parsing. Construct via
 * {@link "./parse".parseScript} — instances are deeply frozen.
 *
 * @example
 * ```ts
 * const msg = parseScript(xml);
 * msg.header.messageId;
 * msg.asNewRx()?.medication?.description;
 * ```
 */
export class ScriptMessage {
  /** Routing/correlation header fields. */
  readonly header: ScriptHeader;
  /** The typed transaction body. */
  readonly body: ScriptBody;
  /** Non-fatal warnings, in the order raised. */
  readonly warnings: readonly NcpdpScriptWarning[];
  /**
   * The trading-partner profile in effect for this parse — either passed
   * explicitly via `parseScript`'s `options.profile` or resolved from the
   * process-scoped default. Present only when a profile applied; attribution
   * only (v1 profiles never alter the parse).
   */
  readonly profile?: NcpdpProfile;

  /**
   * @param init - Pre-extracted header, body, warnings, and optional profile.
   */
  constructor(init: {
    header: ScriptHeader;
    body: ScriptBody;
    warnings: readonly NcpdpScriptWarning[];
    profile?: NcpdpProfile;
  }) {
    this.header = deepFreeze(init.header);
    this.body = deepFreeze(init.body);
    this.warnings = Object.freeze(init.warnings.slice());
    if (init.profile !== undefined) this.profile = init.profile;
    Object.freeze(this);
  }

  /**
   * The {@link NewRx} body when this message is a NewRx, else `undefined`.
   *
   * @returns The NewRx body, or `undefined`.
   *
   * @example
   * ```ts
   * const rx = parseScript(xml).asNewRx();
   * rx?.medication?.description;
   * ```
   */
  asNewRx(): NewRx | undefined {
    return this.body.kind === "NewRx" ? this.body : undefined;
  }

  /**
   * The {@link StatusBody} when this message is a `<Status>` response, else
   * `undefined`.
   *
   * @returns The Status body, or `undefined`.
   *
   * @example
   * ```ts
   * parseScript(xml).asStatus()?.code;
   * ```
   */
  asStatus(): StatusBody | undefined {
    return this.body.kind === "Status" ? this.body : undefined;
  }

  /**
   * The {@link ErrorBody} when this message is an `<Error>` response, else
   * `undefined`.
   *
   * @returns The Error body, or `undefined`.
   *
   * @example
   * ```ts
   * parseScript(xml).asError()?.code;
   * ```
   */
  asError(): ErrorBody | undefined {
    return this.body.kind === "Error" ? this.body : undefined;
  }

  /**
   * The {@link VerifyBody} when this message is a `<Verify>` response, else
   * `undefined`.
   *
   * @returns The Verify body, or `undefined`.
   *
   * @example
   * ```ts
   * parseScript(xml).asVerify()?.code;
   * ```
   */
  asVerify(): VerifyBody | undefined {
    return this.body.kind === "Verify" ? this.body : undefined;
  }

  /**
   * The {@link LifecycleRequest} body when this message is a renewal/change/cancel
   * **request** (`RxRenewalRequest`/`RxChangeRequest`/`CancelRx`), else `undefined`.
   *
   * @returns The lifecycle request body, or `undefined`.
   *
   * @example
   * ```ts
   * parseScript(xml).asLifecycleRequest()?.medicationPrescribed?.description;
   * ```
   */
  asLifecycleRequest(): LifecycleRequest | undefined {
    switch (this.body.kind) {
      case "RxRenewalRequest":
      case "RxChangeRequest":
      case "CancelRx":
        return this.body;
      case "RxRenewalResponse":
      case "RxChangeResponse":
      case "CancelRxResponse":
      case "NewRx":
      case "Status":
      case "Error":
      case "Verify":
      case "unsupported":
        return undefined;
    }
  }

  /**
   * The {@link LifecycleResponse} body when this message is a renewal/change/cancel
   * **response** (`RxRenewalResponse`/`RxChangeResponse`/`CancelRxResponse`), else
   * `undefined`.
   *
   * @returns The lifecycle response body, or `undefined`.
   *
   * @example
   * ```ts
   * parseScript(xml).asLifecycleResponse()?.outcome; // "approved" | "denied" | …
   * ```
   */
  asLifecycleResponse(): LifecycleResponse | undefined {
    switch (this.body.kind) {
      case "RxRenewalResponse":
      case "RxChangeResponse":
      case "CancelRxResponse":
        return this.body;
      case "RxRenewalRequest":
      case "RxChangeRequest":
      case "CancelRx":
      case "NewRx":
      case "Status":
      case "Error":
      case "Verify":
      case "unsupported":
        return undefined;
    }
  }

  /**
   * The disposition of this message when it is a response transaction
   * (`<Status>`/`<Error>`/`<Verify>`), else `undefined`. Derived only from the
   * body kind: an `<Error>` is **always** `"error"` and is never read as a
   * success.
   *
   * @returns The {@link ResponseDisposition}, or `undefined` for a request /
   *   unsupported transaction.
   *
   * @example
   * ```ts
   * parseScript(xml).disposition; // "success" | "error" | "verify" | undefined
   * ```
   */
  get disposition(): ResponseDisposition | undefined {
    switch (this.body.kind) {
      case "Status":
      case "Error":
      case "Verify":
        return dispositionOf(this.body.kind);
      case "NewRx":
      case "RxRenewalRequest":
      case "RxChangeRequest":
      case "CancelRx":
      case "RxRenewalResponse":
      case "RxChangeResponse":
      case "CancelRxResponse":
      case "unsupported":
        return undefined;
    }
  }

  /**
   * The identifier of the message this one answers (`<RelatesToMessageID>`), or
   * `undefined`. The correlation key that ties a response back to its request.
   *
   * @returns The correlated message id, or `undefined`.
   *
   * @example
   * ```ts
   * parseScript(responseXml).correlatesTo; // the request's MessageID
   * ```
   */
  get correlatesTo(): string | undefined {
    return this.header.relatesToMessageId;
  }

  /**
   * Serialize this message back to canonical NCPDP SCRIPT XML. Equivalent to
   * {@link "./serialize".serializeScript}; only the modeled fields are emitted, so
   * the result is canonical (idempotent under re-parse) rather than byte-identical
   * to any original input.
   *
   * @returns The canonical SCRIPT XML string.
   *
   * @example
   * ```ts
   * parseScript(raw).toString(); // canonical XML
   * ```
   */
  toString(): string {
    return serializeScript(this);
  }
}
