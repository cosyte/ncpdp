import type { XmlElement } from "./xml-load.js";

/**
 * Return the first direct child element named `name`, or `undefined`.
 *
 * @param el - The element to search.
 * @param name - The local child name to match.
 * @returns The first match, or `undefined`.
 *
 * @example
 * ```ts
 * firstChild(message, "Header");
 * ```
 */
export function firstChild(el: XmlElement, name: string): XmlElement | undefined {
  return el.children.find((c) => c.name === name);
}

/**
 * Depth-first search for the first descendant (or self) named `name`.
 *
 * @param el - The element to search from.
 * @param name - The local name to match.
 * @returns The first match in document order, or `undefined`.
 *
 * @example
 * ```ts
 * firstDescendantNamed(message, "MedicationPrescribed");
 * ```
 */
export function firstDescendantNamed(el: XmlElement, name: string): XmlElement | undefined {
  if (el.name === name) return el;
  for (const child of el.children) {
    const found = firstDescendantNamed(child, name);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Trimmed text of the first direct child named `name`, or `undefined` when the
 * child is absent. Empty/whitespace-only text yields `undefined`.
 *
 * @param el - The parent element.
 * @param name - The local child name.
 * @returns The trimmed text, or `undefined`.
 *
 * @example
 * ```ts
 * childText(header, "MessageID"); // "abc-123"
 * ```
 */
export function childText(el: XmlElement, name: string): string | undefined {
  const child = firstChild(el, name);
  if (child === undefined) return undefined;
  const trimmed = child.text.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Value of attribute `attr` on `el`, or `undefined` when absent.
 *
 * @param el - The element.
 * @param attr - The (namespace-stripped) attribute name.
 * @returns The attribute value, or `undefined`.
 *
 * @example
 * ```ts
 * attrValue(drugCoded, "Qualifier");
 * ```
 */
export function attrValue(el: XmlElement, attr: string): string | undefined {
  return el.attrs[attr];
}
