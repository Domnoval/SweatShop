/**
 * Minimal deterministic XML emitter.
 *
 * Attributes are emitted in the order given — never from object key iteration,
 * which spec §5.3 forbids relying on. Output uses `\n` line endings only, and
 * the emitter has no way to write a comment, a `<metadata>` block, or an editor
 * namespace, so the classes of leak listed in spec §14.2 cannot be produced by
 * accident.
 */

export type Attribute = readonly [name: string, value: string];

const ESCAPES: Readonly<Record<string, string>> = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
});

export function escapeAttribute(value: string): string {
  return value.replace(/[&<>"]/gu, (character) => ESCAPES[character]!);
}

/** Collapse whitespace runs in path data to single spaces (spec §14.1). */
export function normalizePathData(d: string): string {
  return d.trim().replace(/\s+/gu, " ");
}

function attributeText(attributes: readonly Attribute[]): string {
  return attributes
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join("");
}

export function selfClosing(name: string, attributes: readonly Attribute[]): string {
  return `<${name}${attributeText(attributes)}/>`;
}

export function element(
  name: string,
  attributes: readonly Attribute[],
  children: readonly string[],
  indent: number,
): string {
  if (children.length === 0) return `${" ".repeat(indent)}${selfClosing(name, attributes)}`;
  const pad = " ".repeat(indent);
  const inner = children.map((child) => `${" ".repeat(indent + 2)}${child}`).join("\n");
  return `${pad}<${name}${attributeText(attributes)}>\n${inner}\n${pad}</${name}>`;
}

/** A group whose children are already indented. */
export function group(
  attributes: readonly Attribute[],
  children: readonly string[],
  indent: number,
): string {
  return element("g", attributes, children, indent);
}
