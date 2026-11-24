// Font family resolution (R-TEXT-9, DESIGN §5.2).

/** v12's default `fontFamily` (P1). The final v13 default is settled before 13.0 (D73). */
export const DEFAULT_FONT_FAMILY = '"trebuchet ms", verdana, arial, sans-serif';

/** `text` without its trailing semicolons. A scan, as `/;+$/` retries a run from each position. */
function trimSemicolons(text: string): string {
  let end = text.length;
  while (text[end - 1] === ';') end--;
  return text.slice(0, end);
}

const clean = (stack: string | undefined): string =>
  stack === undefined ? '' : trimSemicolons(stack.trim()).trim();

/**
 * The font family to draw and measure with. The `--mermaid-fontFamily` CSS variable comes
 * first, because the SVG draws with it when the page sets it; then the `fontFamily` config;
 * then v12's default stack.
 */
export function resolveFontFamily(fontFamily?: string, cssVariable?: string): string {
  return clean(cssVariable) || clean(fontFamily) || DEFAULT_FONT_FAMILY;
}

/** Lower-case family names of a CSS font-family stack, without quotes. */
export function familyNames(stack: string): string[] {
  return stack
    .split(',')
    .map((name) =>
      trimSemicolons(name.trim())
        .replace(/^(['"])(.*)\1$/, '$2')
        .trim()
        .toLowerCase()
    )
    .filter((name) => name !== '');
}

// CSS absolute-size keywords (medium = 16px) and the relative ones as a step of 1.2.
const SIZE_KEYWORDS: Readonly<Record<string, number>> = {
  'xx-small': 9,
  'x-small': 10,
  small: 13,
  medium: 16,
  large: 18,
  'x-large': 24,
  'xx-large': 32,
};
// px per unit; `em`, `ex`, `ch` and `%` are relative to the label's own font size.
const PX_PER: Readonly<Record<string, number>> = {
  '': 1,
  px: 1,
  pt: 4 / 3,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  rem: 16,
};
const RELATIVE: Readonly<Record<string, number>> = { em: 1, ex: 0.5, ch: 0.5, '%': 0.01 };
const RE_FONT_SIZE = /^(\d+(?:\.\d+)?|\.\d+)([a-z%]*)$/i;

/**
 * A checked `font-size` in px, measured as the browser draws it: units and keywords resolved
 * against `base`. Undefined for what has no fixed size here (`vw`, `vh`).
 */
export function fontSizePx(value: unknown, base: number): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const v = String(value).trim().toLowerCase();
  if (v === 'smaller') return base / 1.2;
  if (v === 'larger') return base * 1.2;
  if (SIZE_KEYWORDS[v] !== undefined) return SIZE_KEYWORDS[v];
  const m = RE_FONT_SIZE.exec(v);
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = m[2] ?? '';
  if (PX_PER[unit] !== undefined) return n * PX_PER[unit];
  if (RELATIVE[unit] !== undefined) return n * RELATIVE[unit] * base;
  return undefined;
}
