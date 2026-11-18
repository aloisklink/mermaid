/**
 * The escaping of names inside AST ids and the decoding of v12's entity placeholders, which
 * hand-written diagram parsers repeat. A subpath of its own, so that only the diagrams that use
 * them load it (DESIGN §2).
 */
import { entityAt } from '../text/entities.js';

/** The characters every AST id escapes: the id grammar's own (`%`, `>`, `@`, `#`). */
export const ID_RESERVED = '%>@#';
/** Control characters, lone surrogates and non-characters, which some diagrams escape too. */
export const ID_CONTROL = '\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f\\ud800-\\udfff\\ufffe\\uffff';

const TWO_DIGITS = 0x80;

/**
 * An escaper of names inside AST ids: each UTF-16 unit in `set` (the inside of a regex
 * character class) becomes `%XX` (`%XXXX` from U+0080 on). Diagrams differ in what they
 * escape, so each passes its own set.
 */
export function idEscaper(set: string = ID_RESERVED): (name: string) => string {
  const needs = new RegExp(`[${set}]`, 'u');
  const all = new RegExp(`[${set}]`, 'gu');
  const hex = (c: string): string => {
    const n = c.charCodeAt(0);
    return `%${n
      .toString(16)
      .toUpperCase()
      .padStart(n < TWO_DIGITS ? 2 : 4, '0')}`;
  };
  return (name) => (needs.test(name) ? name.replace(all, hex) : name);
}

/**
 * Undoes v12's `encodeEntities` placeholders, as v12's renderer did (`decodeEntities`): `&name;`
 * and `&#123;`. A name core cannot decode goes back to `#name;`, as written (D561).
 */
export function decodePlaceholders(text: string): string {
  // Most text holds none: a parser calls this once per token.
  if (!text.includes('ﬂ') && !text.includes('¶ß')) return text;
  return text
    .replace(/ﬂ°(?!°)(\w+)¶ß/g, (all, name: string) =>
      entityAt(`&${name};`, 0) ? all : `#${name};`
    )
    .replace(/ﬂ°°/g, '&#')
    .replace(/ﬂ°/g, '&')
    .replace(/¶ß/g, ';');
}

/**
 * The entity step of the parser kit's `cook`, for text that is not a source range: each `#name;`
 * as `&name;` and each `#123;` as `&#123;`, which is how v12's renderer read the placeholders its
 * parser saw. A name core cannot decode stays `#name;`, as written (D561).
 */
export const ampEntities = (text: string): string =>
  text.includes('#')
    ? text.replace(/#(\w+);/g, (all, name: string) => {
        const ref = /^\d+$/.test(name) ? `&#${name};` : `&${name};`;
        return ref[1] === '#' || entityAt(ref, 0) ? ref : all;
      })
    : text;
