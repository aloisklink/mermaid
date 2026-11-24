/**
 * Plain-scalar numbers and double-quoted unescaping for the YAML subset (yaml.ts). Pure: errors
 * go to the caller's `fail`, which throws.
 */
import { ESCAPES, HEX_ESCAPE_LENGTH, fold, lf } from './yaml-text.js';

const RE_INT = /^[-+]?(?:0|[1-9][0-9]*)$/;
const RE_HEX = /^[-+]?0x[0-9a-fA-F]+$/;
const RE_OCT = /^[-+]?0o[0-7]+$/;
const RE_BIN = /^[-+]?0b[01]+$/;
const RE_FLOAT = /^[-+]?(?:[0-9][0-9]*(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$/;
const RE_INF = /^[-+]?\.(?:inf|Inf|INF)$/;
const RE_NAN = /^\.(?:nan|NaN|NAN)$/;

/** The number a plain scalar spells (YAML 1.2 core schema ints, floats, .inf, .nan), if any. */
export function plainNumber(s: string): number | undefined {
  if (RE_INT.test(s) || RE_FLOAT.test(s)) return Number(s);
  if (RE_HEX.test(s) || RE_OCT.test(s) || RE_BIN.test(s)) {
    const neg = s.startsWith('-');
    const v = Number(neg || s.startsWith('+') ? s.slice(1) : s);
    return neg ? -v : v;
  }
  if (RE_INF.test(s)) return s.startsWith('-') ? -Infinity : Infinity;
  if (RE_NAN.test(s)) return NaN;
  return undefined;
}

/** The value of a double-quoted scalar's body: folded, with escapes resolved. */
export function unescapeDouble(body: string, fail: (message: string) => never): string {
  if (!body.includes('\\')) return fold(body);
  let out = '';
  const s = fold(lf(body).replace(/\\\n[ \t]*/g, ''));
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] ?? '';
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const e = s[++i] ?? '';
    if (e === 'x' || e === 'u' || e === 'U') {
      const len = HEX_ESCAPE_LENGTH[e];
      const hex = s.slice(i + 1, i + 1 + len);
      const code = /^[0-9a-fA-F]+$/.test(hex) && hex.length === len ? parseInt(hex, 16) : NaN;
      if (!(code <= 0x10ffff)) fail('invalid escape sequence in a double quoted value');
      out += String.fromCodePoint(code);
      i += len;
    } else if (e in ESCAPES) {
      out += ESCAPES[e];
    } else {
      fail('unknown escape sequence in a double quoted value');
    }
  }
  return out;
}
