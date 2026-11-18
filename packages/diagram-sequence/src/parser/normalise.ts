/**
 * Value conversion as v12's `SequenceDB` did it (parser-method §3): `wrap:`/`nowrap:` prefixes
 * (`extractWrap`, `parseMessage`), message text (`text2`), box data (`parseBoxData`) and the
 * actor menu texts (`addLinks`, `addALink`, `addProperties`). Text is otherwise kept as written:
 * v12's `sanitizeText` runs when SVG is written, not here.
 */
// cspell:words currentcolor accentcolor accentcolortext activetext buttonborder canvastext linktext marktext selecteditem selecteditemtext visitedtext threeddarkshadow threedface threedhighlight threedlightshadow threedshadow
import { isSpace, LPAREN } from '@mermaid-js/core/v13/parser-kit/index.js';
import { decodePlaceholders } from '@mermaid-js/core/v13/parser-kit/support.js';
import { isYamlMap, parseYaml } from '@mermaid-js/core/v13/preprocess/index.js';
import { isNamedColor } from './colors.js';
import { PARTICIPANT_KINDS, type ParticipantKind } from '../model.js';

/** Text and its `wrap:`/`nowrap:` prefix; `wrap` undefined follows the config. */
export interface Wrapped {
  text: string;
  wrap?: boolean;
}

/** v12 `extractWrap` on trimmed text: `wrap:`/`:wrap:` → true, `nowrap:`/`:nowrap:` → false. */
export function parseMessage(str: string): Wrapped {
  const t = str.trim();
  const colon = t.startsWith(':') ? 1 : 0;
  if (t.startsWith('wrap:', colon)) return { text: t.slice(colon + 5).trim(), wrap: true };
  if (t.startsWith('nowrap:', colon)) return { text: t.slice(colon + 7).trim(), wrap: false };
  return { text: t };
}

/** A message or note text: the `:` token's text (`text2`: trim, drop the `:`, parse). */
export function messageText(txt: string): Wrapped {
  return parseMessage(txt.trim().slice(1));
}

/** CSS system colours (CSS Color 4, deprecated ones included), lower case. */
const SYSTEM_COLORS = new Set(
  (
    'accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas canvastext ' +
    'field fieldtext graytext highlight highlighttext linktext mark marktext selecteditem ' +
    'selecteditemtext visitedtext activeborder activecaption appworkspace background ' +
    'buttonhighlight buttonshadow captiontext inactiveborder inactivecaption ' +
    'inactivecaptiontext infobackground infotext menu menutext scrollbar threeddarkshadow ' +
    'threedface threedhighlight threedlightshadow threedshadow window windowframe windowtext'
  ).split(' ')
);
const KEYWORDS = new Set(['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'revert']);

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const isNumber = (s: string) => NUMBER.test(s);
const isPercent = (s: string) => s.endsWith('%') && isNumber(s.slice(0, -1));
const isAngle = (s: string) => {
  const m = /^(.*?)(deg|grad|rad|turn)$/i.exec(s);
  return m ? isNumber(m[1] ?? '') : isNumber(s);
};

/** The arguments of `rgb()`/`hsl()` as CSS Color 4 accepts them (legacy commas or modern). */
function colorArgs(fn: 'rgb' | 'hsl', body: string): boolean {
  const s = body.trim();
  if (s.includes(',')) {
    // Legacy syntax: no `none`; rgb takes all numbers or all percentages, hsl a hue then %.
    const a = s.split(',').map((x) => x.trim());
    if (a.length !== 3 && a.length !== 4) return false;
    const alpha = a[3] === undefined || isNumber(a[3]) || isPercent(a[3]);
    const [x = '', y = '', z = ''] = a;
    if (fn === 'hsl') return alpha && isAngle(x) && isPercent(y) && isPercent(z);
    const allNumbers = [x, y, z].every(isNumber);
    return alpha && (allNumbers || [x, y, z].every(isPercent));
  }
  const [main = '', alpha, extra] = s.split('/');
  if (extra !== undefined) return false;
  const a = main.trim().split(/\s+/);
  if (a.length !== 3) return false;
  const value = (x: string) => x.toLowerCase() === 'none' || isNumber(x) || isPercent(x);
  const alphaOk = alpha === undefined || value(alpha.trim());
  const [h = ''] = a;
  if (fn === 'hsl') {
    return alphaOk && (h.toLowerCase() === 'none' || isAngle(h)) && a.slice(1).every(value);
  }
  return alphaOk && a.every(value);
}

/**
 * What a browser's `CSS.supports('color', c)` answers for the colours v12's box line can pass:
 * a word (named, system or keyword colour) or `rgb[a](…)` / `hsl[a](…)`.
 */
export function isCssColor(c: string): boolean {
  const lower = c.toLowerCase();
  if (KEYWORDS.has(lower) || SYSTEM_COLORS.has(lower)) return true;
  const fn = /^(rgba?|hsla?)\((.*)\)$/s.exec(lower);
  if (fn) return colorArgs(fn[1]?.startsWith('rgb') ? 'rgb' : 'hsl', fn[2] ?? '');
  return /^[a-z]+$/.test(lower) && isNamedColor(lower);
}

const isWordChar = (c: number) =>
  (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const isLineTerminator = (c: number) => c === 10 || c === 13 || c === 0x2028 || c === 0x2029;

export interface BoxData {
  /** Undefined when the box has no title. */
  text?: string;
  /** `transparent` when none or no valid colour was given. */
  color: string;
  wrap?: boolean;
}

/**
 * v12 `parseBoxData`: the colour first (`rgb(…)`, `rgba(…)`, `hsl(…)`, `hsla(…)` or a word),
 * the title after it. A first word that is not a CSS colour makes the whole text the title.
 * It ports `/^((?:rgba?|hsla?)\s*\(.*\)|\w*)(.*)$/` as a scan.
 */
export function parseBoxData(str: string): BoxData {
  let color = 'transparent';
  let title: string | undefined;
  let line = true;
  for (let i = 0; i < str.length; i++) if (isLineTerminator(str.charCodeAt(i))) line = false;
  if (line) {
    let split = -1;
    const fn = /^(?:rgba?|hsla?)/.exec(str);
    if (fn) {
      let j = fn[0].length;
      while (j < str.length && isSpace(str.charCodeAt(j))) j++;
      const close = str.lastIndexOf(')');
      if (str.charCodeAt(j) === LPAREN && close > j) split = close + 1;
    }
    if (split < 0) {
      split = 0;
      while (split < str.length && isWordChar(str.charCodeAt(split))) split++;
    }
    const head = str.slice(0, split);
    const tail = str.slice(split);
    if (head) color = head.trim();
    if (tail) title = tail.trim();
  }
  if (!isCssColor(color)) {
    color = 'transparent';
    title = str.trim();
  }
  if (title === undefined) return { color };
  const { text, wrap } = parseMessage(title);
  const out: BoxData = { color };
  if (text) out.text = text;
  if (wrap !== undefined) out.wrap = wrap;
  return out;
}

/** `&equals;` and `&amp;` back to `=` and `&`, as v12's menu statements did. */
const unescapeMenu = (text: string) => text.replace(/&equals;/g, '=').replace(/&amp;/g, '&');

/** v12's `encodeEntities` placeholders, which its menu statements worked on. */
const encode = (text: string) =>
  text.replace(/#(\w+);/g, (_, name: string) =>
    /^\+?\d+$/.test(name) ? `ﬂ°°${name}¶ß` : `ﬂ°${name}¶ß`
  );
const decoded = (v: unknown): unknown => {
  if (typeof v === 'string') return decodePlaceholders(v);
  if (Array.isArray(v)) return v.map(decoded);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[decodePlaceholders(k)] = decoded(x);
    return out;
  }
  return v;
};

/**
 * What `links`/`link`/`properties` carry (D105), as v12 merged it into the participant, from
 * the text after `:` as written (entities as `#name;`): the value's `for … in` keys, so an
 * array merges by index and a string by character; undefined when the text is not JSON (v12
 * logged that and ignored the statement). v12 worked on its entity placeholders, so this does
 * too, and decodes them at the end.
 */
export function menuData(
  type: 'Links' | 'Link' | 'Properties' | 'Details',
  written: string
): { links?: Record<string, unknown>; properties?: Record<string, unknown> } | undefined {
  if (type === 'Details') return {};
  const text = encode(written);
  if (type === 'Link') return { links: decoded(menuLink(text)) as Record<string, unknown> };
  let value: unknown;
  try {
    value = JSON.parse(type === 'Links' ? unescapeMenu(text) : text);
  } catch {
    return undefined;
  }
  const merged: Record<string, unknown> = {};
  if (typeof value === 'string') {
    for (let i = 0; i < value.length; i++) merged[String(i)] = value[i];
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) merged[k] = v;
  }
  const out = decoded(merged) as Record<string, unknown>;
  return type === 'Links' ? { links: out } : { properties: out };
}

/** `link A: label @ url`, split as v12's `addALink` did (the character before `@` is dropped). */
function menuLink(text: string): Record<string, string> {
  const sep = text.indexOf('@');
  const t = unescapeMenu(text);
  return { [t.slice(0, sep - 1).trim()]: t.slice(sep + 1).trim() };
}

/** v12's participant types (`PARTICIPANT_TYPE`). */
export const KINDS: readonly ParticipantKind[] = PARTICIPANT_KINDS;

export interface ParticipantData {
  type?: ParticipantKind;
  alias?: string;
  /** The YAML error, when the data is not valid YAML. */
  error?: string;
  /** A `type` v12 does not know, as written (read as `participant`). */
  unknownType?: string;
}

/**
 * The `@{ … }` data: v12 read it as YAML (JSON schema), wrapped in braces when it is one line,
 * and took `type` and `alias` from it (DB:164–177).
 */
export function participantData(text: string): ParticipantData {
  const result = parseYaml(text.includes('\n') ? `${text}\n` : `{\n${text}\n}`);
  const error = result.diagnostics.find((d) => d.severity === 'error');
  if (error) return { error: error.message };
  const value = result.value;
  if (!isYamlMap(value)) return {};
  const out: ParticipantData = {};
  const { type, alias } = value;
  if (typeof type === 'string' && (KINDS as readonly string[]).includes(type)) {
    out.type = type as ParticipantKind;
  } else if (type !== undefined && type !== null) {
    out.type = 'participant';
    out.unknownType = typeof type === 'string' ? type : JSON.stringify(type);
  }
  if (typeof alias === 'string' && alias !== '') out.alias = alias;
  return out;
}
