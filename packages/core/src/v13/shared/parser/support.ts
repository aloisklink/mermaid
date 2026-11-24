/**
 * Small pieces every hand-written parser repeats: the statement-level stop sentinel, the
 * "got …" text of an unexpected token, and the escaping of names inside AST ids.
 */
import { Kind } from '../../parser-kit/index.js';

/**
 * Thrown inside a parser after a diagnostic is recorded; caught at statement level. One
 * instance, so its stack is captured once.
 */
export class Stop extends Error {}
export const STOP: Stop = /* @__PURE__ */ new Stop();

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
 * What an "Expected …, got …" message says was found: the end, a line break, or the token's
 * text (trimmed, its first line, at most 24 characters) in backticks.
 */
export function foundText(kind: number, raw: string): string {
  if (kind === Kind.EOF) return 'the end of the text';
  if (kind === Kind.Newline) return 'a line break';
  const text = raw.trim();
  const line = text.split('\n', 1)[0] ?? '';
  return line.length > 24 || line !== text ? `\`${line.slice(0, 24)}…\`` : `\`${line}\``;
}
