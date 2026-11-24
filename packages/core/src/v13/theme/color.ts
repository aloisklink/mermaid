/**
 * Colour maths for theme derivation (DESIGN §8.1, ADR-4), without khroma (R-THEME-10).
 * Mixing is `color-mix(in srgb, …)` as CSS Color 5 defines it (premultiplied alpha), so a
 * value computed here is the one a browser computes for the CSS expression.
 */
import { NAMED } from './named.js';

/** sRGB channels 0–255 and alpha 0–1. Channels are not rounded. */
export type Rgba = readonly [number, number, number, number];

const RE_HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RE_FUNC = /^(rgba?|hsla?)\(([^()]{1,100})\)$/i;
const RE_NUM = /^([+-]?(?:\d{1,10}(?:\.\d{1,10})?|\.\d{1,10}))(%|deg)?$/i;

let named: Map<string, string> | undefined;

function namedHex(name: string): string | undefined {
  if (!named) {
    named = new Map();
    for (const entry of NAMED.split(' ')) named.set(entry.slice(0, -6), entry.slice(-6));
  }
  return named.get(name.replace(/grey/g, 'gray'));
}

function hex(digits: string): Rgba {
  const d = digits.length < 6 ? digits.replace(/./g, '$&$&') : digits;
  const at = (i: number): number => parseInt(d.slice(2 * i, 2 * i + 2), 16);
  return [at(0), at(1), at(2), d.length === 8 ? at(3) / 255 : 1];
}

// A number or percentage; `full` is what 100% means. NaN when it is neither.
function part(raw: string | undefined, full: number, angle = false): number {
  const m = RE_NUM.exec((raw ?? '').trim());
  if (!m) return NaN;
  const n = Number(m[1]);
  if (m[2] === '%') return angle ? NaN : (n / 100) * full;
  if (m[2] && !angle) return NaN;
  return n;
}

const clamp = (n: number, max: number): number => Math.min(Math.max(n, 0), max);

/** A colour's channels, or undefined for anything that only CSS can compute. */
export function parseColor(value: string): Rgba | undefined {
  const v = value.trim().toLowerCase();
  const h = RE_HEX.exec(v);
  if (h) return hex(h[1] as string);
  if (v === 'transparent') return [0, 0, 0, 0];
  const n = namedHex(v);
  if (n) return hex(n);
  const f = RE_FUNC.exec(v);
  if (!f) return undefined;
  const body = f[2] as string;
  const [main, alpha, extra] = body.includes(',') ? [body] : body.split('/');
  if (extra !== undefined || main === undefined) return undefined;
  const list = main.trim().split(body.includes(',') ? /\s*,\s*/ : /\s+/);
  if (alpha !== undefined) list.push(alpha);
  if (list.length < 3 || list.length > 4) return undefined;
  const a = list[3] === undefined ? 1 : clamp(part(list[3], 1), 1);
  let rgb: number[];
  if ((f[1] as string).startsWith('rgb')) {
    rgb = list.slice(0, 3).map((c) => clamp(part(c, 255), 255));
  } else {
    const hue = (((part(list[0], 0, true) % 360) + 360) % 360) / 30;
    const s = clamp(part(list[1], 1), 1);
    const l = clamp(part(list[2], 1), 1);
    const k = s * Math.min(l, 1 - l);
    rgb = [0, 8, 4].map((o) => {
      const t = (o + hue) % 12;
      return (l - k * Math.max(-1, Math.min(t - 3, 9 - t, 1))) * 255;
    });
  }
  const out = [rgb[0], rgb[1], rgb[2], a] as [number, number, number, number];
  return out.some((c) => Number.isNaN(c)) ? undefined : out;
}

/**
 * `color-mix(in srgb, a p, b)` with `p` the weight of `a` (0–1), premultiplied as in
 * CSS Color 5.
 */
export function mixColors(a: Rgba, b: Rgba, p: number): Rgba {
  const q = 1 - p;
  const alpha = a[3] * p + b[3] * q;
  if (alpha === 0) return [0, 0, 0, 0];
  const ch = (i: 0 | 1 | 2): number => (a[i] * a[3] * p + b[i] * b[3] * q) / alpha;
  return [ch(0), ch(1), ch(2), alpha];
}

// khroma writes HSL channels with 10 decimals; v12's colours are those strings.
const round10 = (n: number): number => Math.round(n * 1e10) / 1e10;

/**
 * khroma's HSL channels: hue in degrees, kept with its sign as khroma keeps it, saturation and
 * lightness 0–100. v12's derived colours carry these from step to step (D117).
 */
export type Hsl = readonly [number, number, number];

/** `c` as khroma's HSL channels, unrounded. */
export function rgbToHsl(c: Rgba): Hsl {
  const [r, g, b] = [c[0] / 255, c[1] / 255, c[2] / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [h * 60, s * 100, l * 100];
}

/**
 * khroma's `change` of hue and lightness (its `adjust`, `lighten` and `darken`, which v12's
 * themes derive with, D117): the hue turned by `dh` degrees (modulo 360, sign
 * kept), the lightness moved by `dl` points and clamped to 0–100, and every channel rounded to
 * 10 decimals as khroma writes them.
 */
export function shiftHsl(c: Hsl, dh: number, dl: number): Hsl {
  return [
    round10(dh === 0 ? c[0] : (c[0] + dh) % 360),
    round10(c[1]),
    round10(clamp(c[2] + dl, 100)),
  ];
}

/** HSL channels back to sRGB, as a browser converts `hsl()`. */
export function hslToRgb(c: Hsl, alpha: number): Rgba {
  const lt = c[2] / 100;
  const k = (c[1] / 100) * Math.min(lt, 1 - lt);
  const hue = (c[0] < 0 ? (c[0] % 360) + 360 : c[0]) / 30; // degrees → twelfths of a turn
  const [x, y, z] = [0, 8, 4].map((o) => {
    const t = (o + hue) % 12;
    return (lt - k * Math.max(-1, Math.min(t - 3, 9 - t, 1))) * 255;
  }) as [number, number, number];
  return [x, y, z, alpha];
}

/**
 * `c` with its channels rounded to 10 decimals, as khroma writes rgb(): how v12's `invert` read
 * a colour an HSL step made (D258), so a channel on .5 rounds as v12's does.
 */
export function khromaRgb(c: Rgba): Rgba {
  return [round10(c[0]), round10(c[1]), round10(c[2]), c[3]];
}

/**
 * `c` with `r`, `g` and `b` added to its channels, each clamped to 0–255: khroma's
 * `adjust(c, { r, g, b })`, which v12's quadrant fills derive with (D232).
 */
export function adjustChannels(c: Rgba, r: number, g: number, b: number): Rgba {
  return [clamp(c[0] + r, 255), clamp(c[1] + g, 255), clamp(c[2] + b, 255), c[3]];
}

export function invertColor(c: Rgba): Rgba {
  return [255 - c[0], 255 - c[1], 255 - c[2], c[3]];
}

const byte = (n: number): string => Math.round(clamp(n, 255)).toString(16).padStart(2, '0');

/** Six hex digits, or eight when not opaque. */
export function formatColor(c: Rgba): string {
  return '#' + byte(c[0]) + byte(c[1]) + byte(c[2]) + (c[3] >= 1 ? '' : byte(c[3] * 255));
}

const linear = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2 relative luminance (alpha ignored). */
export function luminance(c: Rgba): number {
  return 0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2]);
}

/** WCAG 2 contrast ratio, 1–21. Translucent colours should be composited first. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `top` painted over an opaque `bottom`. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3];
  return [
    top[0] * a + bottom[0] * (1 - a),
    top[1] * a + bottom[1] * (1 - a),
    top[2] * a + bottom[2] * (1 - a),
    1,
  ];
}
