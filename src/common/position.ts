/**
 * Positional context attached to NCPDP SCRIPT warnings and fatal errors.
 *
 * SCRIPT is XML, so position is an XPath-style location string (e.g.
 * `/Message/Body/NewRx/MedicationPrescribed`) — never a field value. This keeps
 * diagnostics PHI-safe: a consumer learns *where* a problem is without the
 * library echoing patient data.
 */
export interface ScriptPosition {
  /** XPath-style location of the element, e.g. `/Message/Body/NewRx`. */
  readonly path: string;
}

/**
 * Build a {@link ScriptPosition} from an XPath-style location string.
 *
 * @param path - XPath-style location, e.g. `/Message/Header/To`.
 * @returns A frozen positional context.
 *
 * @example
 * ```ts
 * const pos = scriptPosition("/Message/Body/NewRx/Patient");
 * pos.path; // "/Message/Body/NewRx/Patient"
 * ```
 */
export function scriptPosition(path: string): ScriptPosition {
  return Object.freeze({ path });
}

/**
 * Append a child step to an XPath-style location string.
 *
 * @param parent - The parent path, e.g. `/Message/Body`.
 * @param child - The child element name, e.g. `NewRx`.
 * @returns The joined path, e.g. `/Message/Body/NewRx`.
 *
 * @example
 * ```ts
 * joinPath("/Message/Body", "NewRx"); // "/Message/Body/NewRx"
 * ```
 */
export function joinPath(parent: string, child: string): string {
  return parent === "/" ? `/${child}` : `${parent}/${child}`;
}
