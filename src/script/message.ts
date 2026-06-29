import { deepFreeze } from "../common/freeze.js";
import type { NcpdpScriptWarning } from "../common/warnings.js";
import type { ScriptHeader } from "./header.js";
import type { NewRx } from "./newrx.js";
import {
  dispositionOf,
  type ErrorBody,
  type ResponseBody,
  type ResponseDisposition,
  type StatusBody,
  type VerifyBody,
} from "./response.js";

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
export type ScriptBody = NewRx | ResponseBody | UnsupportedBody;

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
   * @param init - Pre-extracted header, body, and warnings.
   */
  constructor(init: {
    header: ScriptHeader;
    body: ScriptBody;
    warnings: readonly NcpdpScriptWarning[];
  }) {
    this.header = deepFreeze(init.header);
    this.body = deepFreeze(init.body);
    this.warnings = Object.freeze(init.warnings.slice());
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
}
