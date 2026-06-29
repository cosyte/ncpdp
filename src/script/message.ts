import { deepFreeze } from "../common/freeze.js";
import type { NcpdpScriptWarning } from "../common/warnings.js";
import type { ScriptHeader } from "./header.js";
import type { NewRx } from "./newrx.js";

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
export type ScriptBody = NewRx | UnsupportedBody;

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
}
