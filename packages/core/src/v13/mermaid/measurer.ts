// cspell:words kepano
// Measurer selection and the browser canvas measurer (DESIGN §5.1, R-TEXT-5, R-TEXT-7).
// Core never imports this module; `mermaid` injects the selected measurer into the render
// context, so core stays free of the DOM (R-ARCH-1).
// Based on Pele's canvasMeasurer (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano).
import {
  SMALLER,
  Style,
  tableMeasurer,
  type FontKey,
  type Measurer,
  type StyleBits,
  type VerticalMetrics,
} from '../text/index.js';

interface Context2D {
  font: string;
  measureText(text: string): {
    width: number;
    fontBoundingBoxAscent?: number;
    fontBoundingBoxDescent?: number;
  };
}

// The parts of document.fonts used here (`size` is in lib DOM.Iterable, not lib DOM).
interface FontSet {
  readonly size: number;
  check(font: string, text?: string): boolean;
}

/** Entries kept per CSS font; at this size the font's cache is cleared whole (D201). */
const MAX_CACHED = 20000;
const MONO_FAMILY = 'monospace';

function context(): Context2D | null {
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(1, 1).getContext('2d') as Context2D | null;
    }
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      return document.createElement('canvas').getContext('2d');
    }
  } catch {
    return null;
  }
  return null;
}

function fontSet(): FontSet | undefined {
  return typeof document === 'undefined'
    ? undefined
    : (document.fonts as unknown as FontSet | undefined);
}

// Whether the canvas has the font itself rather than a fallback while it loads. A font that
// cannot be checked counts as loaded.
function hasFont(fonts: FontSet | undefined, font: string, text: string): boolean {
  try {
    return fonts?.check(font, text) ?? true;
  } catch {
    return true;
  }
}

function cssFont(font: FontKey, style: StyleBits): string {
  const size = style & (Style.Sub | Style.Sup) ? font.size / SMALLER : font.size;
  return (
    (style & Style.Italic ? 'italic ' : '') +
    (style & Style.Bold ? 'bold' : String(font.weight)) +
    ` ${size}px ` +
    (style & Style.Mono ? MONO_FAMILY : font.family)
  );
}

/**
 * A measurer that measures whole strings with canvas `measureText`, or null where there is
 * no canvas. Widths are cached per CSS font (20k entries, then cleared whole), except while
 * `document.fonts.check` says the font is not loaded yet; all caches are dropped when
 * `document.fonts.size` changes, so a late-loading web font is re-measured.
 */
export function canvasMeasurer(): Measurer | null {
  const ctx = context();
  if (!ctx) return null;
  const widths = new Map<string, Map<string, number>>();
  const vertical = new Map<string, VerticalMetrics>();
  let faces = fontSet()?.size;
  let current = '';

  const use = (font: string): FontSet | undefined => {
    const fonts = fontSet();
    if (fonts?.size !== faces) {
      faces = fonts?.size;
      widths.clear();
      vertical.clear();
    }
    if (font !== current) ctx.font = current = font;
    return fonts;
  };

  return {
    id: 'canvas',
    width(text, font, style) {
      const css = cssFont(font, style);
      const fonts = use(css);
      let cache = widths.get(css);
      const hit = cache?.get(text);
      if (hit !== undefined) return hit;
      const w = ctx.measureText(text).width;
      if (hasFont(fonts, css, text)) {
        if (!cache) widths.set(css, (cache = new Map()));
        if (cache.size >= MAX_CACHED) cache.clear();
        cache.set(text, w);
      } else {
        // The context resolved the font to a fallback when `font` was set; set it again
        // next time so the loaded face is picked up (Chromium keeps the fallback otherwise).
        current = '';
      }
      return w;
    },
    metrics(font) {
      const css = cssFont(font, 0);
      const fonts = use(css);
      const hit = vertical.get(css);
      if (hit) return hit;
      const m = ctx.measureText('Mg');
      if (m.fontBoundingBoxAscent === undefined || m.fontBoundingBoxDescent === undefined) {
        return tableMeasurer.metrics(font);
      }
      const out: VerticalMetrics = {
        ascent: m.fontBoundingBoxAscent,
        descent: m.fontBoundingBoxDescent,
        lineHeight: m.fontBoundingBoxAscent + m.fontBoundingBoxDescent,
      };
      if (hasFont(fonts, css, 'Mg')) vertical.set(css, out);
      else current = '';
      return out;
    },
  };
}

let shared: Measurer | undefined;

export interface MeasurerOptions {
  /** An integrator-supplied measurer. `deterministic` overrides it (R-TEXT-7). */
  measurer?: Measurer;
  /** Forces the table measurer in every environment, even over `measurer` (R-TEXT-7). */
  deterministic?: boolean;
}

/**
 * The measurer for a render: the table measurer when `deterministic`, else the integrator's,
 * else the shared canvas measurer in a browser, else the table measurer.
 */
export function selectMeasurer(options: MeasurerOptions = {}): Measurer {
  if (options.deterministic) return tableMeasurer;
  if (options.measurer) return options.measurer;
  shared ??= canvasMeasurer() ?? undefined;
  return shared ?? tableMeasurer;
}
