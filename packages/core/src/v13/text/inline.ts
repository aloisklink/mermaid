// Inline boxes in labels (DESIGN §5.3, D177): an extension registers a provider for a delimiter
// pair or a pattern (D293), and label layout hands it each span, which comes back as a measured
// box drawn on the line's baseline. Math (`$$…$$`) is the first user; icons (`fa:fa-car`) the next.
import type { IconPacks } from '../pipeline/icon-packs.js';
import type { InlineBox, LabelBoxSpan } from '../svg/writer.js';
import type { FontKey, Measurer, VerticalMetrics } from './measurer.js';

/** What a provider gets with each span: the label's font and how to size against it. */
export interface InlineRequest {
  readonly font: FontKey;
  readonly measurer: Measurer;
  /** `measurer.metrics(font)`. */
  readonly metrics: VerticalMetrics;
  /** One ex in px. The tables carry no x-height, so this is half the font size (the MathJax default). */
  readonly ex: number;
  /**
   * The render's warnings, for a provider that declines a span it cannot draw (bad TeX), so the
   * span shown as written is not silent. As {@link InlineSpans.warn}: once per render.
   */
  readonly warn: Warn;
  /** The render's icon packs (D294), read-only, for a provider that draws icons. */
  readonly iconPacks?: IconPacks;
  /** The render's scratch ({@link InlineSpans.scratch}). */
  readonly scratch: Record<string, unknown>;
}

/**
 * Boxes for one kind of span: a delimiter pair ({@link InlinePairProvider}) or a pattern
 * ({@link InlinePatternProvider}). Registered synchronously (an extension's `inline`); `box` runs
 * during layout, so it is synchronous too. A provider whose engine loads later returns
 * `undefined` until it has loaded (the span is then drawn as written); its extension asks for
 * the engine as a resource, so `prepare()` loads it first (R-API-2). Of every provider's next
 * span, the one that starts first wins; on a tie, the first registered.
 */
export type InlineProvider = InlinePairProvider | InlinePatternProvider;

/** Boxes for a delimiter pair (`$$…$$`). */
export interface InlinePairProvider {
  readonly open: string;
  readonly close: string;
  readonly pattern?: undefined;
  /** Lays out `source`, the text between the delimiters, or declines with `undefined`. */
  box(source: string, request: InlineRequest): InlineBox | undefined;
}

/**
 * Boxes for every match of a pattern (`fa:fa-car`, D293). Its flags are kept except `g`, `y` and
 * `m`; an empty match is no span.
 */
export interface InlinePatternProvider {
  readonly pattern: RegExp;
  readonly open?: undefined;
  readonly close?: undefined;
  /** Lays out `source`, the whole match, or declines with `undefined`. */
  box(source: string, request: InlineRequest): InlineBox | undefined;
}

/** A warning sink, as `RenderContext.warn`. */
type Warn = (warning: {
  readonly code: string;
  readonly message: string;
  readonly feature?: string;
}) => void;

/** One render's providers and its once-per-render warnings, for `LabelOptions.inline`. */
export interface InlineSpans {
  /**
   * Replaces each span a provider boxes with a placeholder character (U+FDD0 + its index) and
   * returns the boxes, or `undefined` when the label has none.
   */
  extract(
    raw: string,
    font: FontKey,
    measurer: Measurer
  ): { readonly source: string; readonly boxes: readonly LabelBoxSpan[] } | undefined;
  /**
   * Whether this render has warned that `feature`'s spans (`'math'`, `'icon'`) are not drawn: its
   * not-rendered warning (`MATH_NOT_RENDERED`, `ICON_NOT_RENDERED`, from core or a provider) or
   * `ASCII_DROPPED`. Not set by a provider's other warnings (`MATH_ERROR`) or the API's
   * `PLACEHOLDER`.
   */
  notRendered(feature: string): boolean;
  /**
   * The render's warnings as providers get them (`InlineRequest.warn`, `GlyphRequest.warn`): a
   * feature's not-rendered code (`ICON_NOT_RENDERED`) once per render (D291), any other code and
   * message once per render.
   */
  readonly warn: Warn;
  /**
   * Names of the HTML tags this render's labels lost, other than `<br>` and the bold and italic
   * subset (D566). Label layout adds to it; the API gives one `HTML_DROPPED` warning for them.
   */
  readonly dropped: Set<string>;
  /**
   * One render's scratch object, the same in every `InlineRequest` and `GlyphRequest` of the
   * render and in its hooks (`ctx.inline.scratch`): what providers note for a `postRender` hook,
   * so an extension keeps no module state. Every extension shares it: key it by extension id.
   */
  readonly scratch: Record<string, unknown>;
}

/** What core finds spans by: a delimiter pair or a pattern, as providers have them. */
interface Spans {
  readonly open?: string;
  readonly close?: string;
  readonly pattern?: RegExp;
}

/**
 * A feature core knows: its spans, the `warning` a label gives for a span no provider's span
 * covers, and the `ASCII_DROPPED` warning text output gives instead (D179).
 */
interface Feature extends Spans {
  readonly warning: { readonly code: string; readonly message: string };
  readonly ascii: {
    readonly code: 'ASCII_DROPPED';
    readonly feature: string;
    readonly message: string;
  };
}

/**
 * Spans core knows a feature for. A span is claimed when a provider's span covers it, so with an
 * icons extension core is quiet and the extension warns about icons it cannot draw (D291).
 */
const FEATURES: readonly Feature[] = [
  {
    open: '$$',
    close: '$$',
    warning: {
      code: 'MATH_NOT_RENDERED',
      message:
        'Math ($$…$$) is not rendered without a math extension: the TeX is shown as written.',
    },
    ascii: {
      code: 'ASCII_DROPPED',
      feature: 'math',
      message: 'Text output has no math ($$…$$): the TeX is shown as written.',
    },
  },
  {
    // D296: v12's prefixes plus `fad`, with no left boundary (`sofa:fa-x` matches). The icons
    // extension's provider has the same regex (`plugin-icons/src/index.ts` `LABEL`): keep them
    // equal. Not shared, since an exported constant costs core bytes (R-PERF-8).
    // cspell:disable-next-line
    pattern: /(fa[bdklrs]?):fa-([\w-]+)/,
    warning: {
      code: 'ICON_NOT_RENDERED',
      message:
        'Icons (fa:fa-…) are not rendered without an icons extension: the text is shown as written.',
    },
    ascii: {
      code: 'ASCII_DROPPED',
      feature: 'icon',
      message: 'Text output has no icons (fa:fa-…): the text is shown as written.',
    },
  },
];

/** Placeholders are Unicode non-characters, which never occur in interchange text. */
export const PLACEHOLDER = 0xfdd0;
const MAX_BOXES = 32;
/** Given once per render when a label's spans are shown as written because of the limits above. */
const LIMIT = {
  code: 'INLINE_LIMIT',
  message: `A label has more than ${MAX_BOXES} inline spans, or a character in U+FDD0–U+FDEF: those spans are shown as written.`,
} as const;
const hex = (n: number): string => n.toString(16).padStart(4, '0');
const RE_PLACEHOLDER = new RegExp(
  `[\\u${hex(PLACEHOLDER)}-\\u${hex(PLACEHOLDER + MAX_BOXES - 1)}]`
);

/** A span found from `at`: its owner (`by`), where it starts and ends (`next`), and its `source`. */
interface Found<P> {
  readonly by: P;
  readonly start: number;
  readonly next: number;
  readonly source: string;
}

/** How to find one provider's (or feature's) spans. */
type Finder<P> = (raw: string, at: number) => Found<P> | undefined;

/**
 * `by`'s next span from `at`, as a regex: a pattern with `g` added and `y`, `m` dropped (its
 * `source` is the whole match), or the pair's `open`, the fewest characters, then `close` (its
 * `source` is what is between them). An empty match is no span and moves the search on by a code
 * point: by a code unit, a `u` or `v` pattern would find it again inside a surrogate pair.
 */
function finder<P extends Spans>(by: P): Finder<P> {
  const { open, close, pattern } = by;
  const re = pattern
    ? new RegExp(pattern.source, `${pattern.flags.replace(/[gmy]/g, '')}g`)
    : new RegExp(`${escape(open!)}([^]*?)${escape(close!)}`, 'g');
  return (raw, at) => {
    re.lastIndex = at;
    for (let m = re.exec(raw); m; m = re.exec(raw)) {
      const start = m.index;
      if (m[0]) return { by, start, next: re.lastIndex, source: pattern ? m[0] : m[1]! };
      re.lastIndex = start + (raw.codePointAt(start)! > 0xffff ? 2 : 1);
    }
    return undefined;
  };
}

/** `text` as a regex matching it: every character but a letter, digit, `_` or space escaped. */
const escape = (text: string): string => text.replace(/[^\w\s]/g, '\\$&');

const FINDERS = FEATURES.map(finder);

/**
 * The inline spans of one render: `providers` in registration order (the span that starts first
 * wins; on a tie, the first registered), `warn` for the feature warnings, given once per render,
 * and the render's icon packs for the providers (D294).
 *
 * Text output (`format: 'ascii'`) draws no boxes, provider or not: every span is shown as
 * written, with one `ASCII_DROPPED` warning per feature (D179).
 */
export function inlineSpans(
  providers: readonly InlineProvider[],
  warn: Warn,
  format: 'svg' | 'ascii' = 'svg',
  iconPacks?: IconPacks
): InlineSpans {
  const ascii = format === 'ascii';
  const finders = ascii ? [] : providers.map(finder);
  const given = new Set<string>();
  const notDrawn = new Set<string>();
  const scratch = {};
  const once: Warn = (w) => {
    let key = `${w.code}\n${w.message}`;
    for (const { warning, ascii: dropped } of FEATURES)
      if (w === dropped || w.code === warning.code) notDrawn.add((key = dropped.feature));
    if (given.has(key)) return;
    given.add(key);
    warn(w);
  };
  return {
    warn: once,
    scratch,
    dropped: new Set(),
    notRendered: (feature) => notDrawn.has(feature),
    extract(raw, font, measurer) {
      // The spans that may be boxed: a label holding a placeholder character boxes none.
      const blocked = RE_PLACEHOLDER.test(raw);
      const spans: Found<InlineProvider>[] = [];
      const boxes: LabelBoxSpan[] = [];
      let request: InlineRequest | undefined;
      let source = '';
      let at = 0;
      for (;;) {
        let found: Found<InlineProvider> | undefined;
        for (const find of finders) {
          const f = find(raw, at);
          if (f && (!found || f.start < found.start)) found = f;
        }
        if (!found) break;
        const { by, start, next } = found;
        spans.push(found);
        let box: InlineBox | undefined;
        if (blocked || boxes.length === MAX_BOXES) once(LIMIT);
        else
          box = by.box(
            found.source,
            (request ??= {
              font,
              measurer,
              metrics: measurer.metrics(font),
              ex: font.size / 2,
              warn: once,
              iconPacks,
              scratch,
            })
          );
        if (box) {
          source += raw.slice(at, start) + String.fromCharCode(PLACEHOLDER + boxes.length);
          const { width, height, baseline, node } = box;
          boxes.push({ kind: 'box', text: raw.slice(start, next), width, height, baseline, node });
        } else source += raw.slice(at, next);
        at = next;
      }
      // A feature's span that no provider's span covers is not drawn (D291).
      for (const find of FINDERS)
        for (let s = find(raw, 0); s && !notDrawn.has(s.by.ascii.feature); s = find(raw, s.next))
          if (!spans.some((c) => c.start <= s.start && s.next <= c.next))
            once(ascii ? s.by.ascii : s.by.warning);
      return boxes.length > 0 ? { source: source + raw.slice(at), boxes } : undefined;
    },
  };
}
