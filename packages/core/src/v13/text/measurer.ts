// The text measurer interface (DESIGN §5.1, R-TEXT-4). Core and diagram code measure only
// through an injected Measurer; core never touches a canvas or the DOM (R-ARCH-1).

/** A font at a size, in CSS terms. `family` is a CSS font-family stack. */
export interface FontKey {
  readonly family: string;
  /** px */
  readonly size: number;
  /** CSS numeric weight; 600 and up counts as bold. */
  readonly weight: number;
}

/** Bit set of `Style` flags. */
export type StyleBits = number;

/** Style flags for a text run. Italic and Underline do not change table widths. */
export const Style = {
  Bold: 1,
  Italic: 2,
  Mono: 4,
  Sub: 8,
  Sup: 16,
  Underline: 32,
} as const;

/** Vertical font metrics in px at the font size. */
export interface VerticalMetrics {
  readonly ascent: number;
  readonly descent: number;
  readonly lineHeight: number;
}

export interface Measurer {
  /** Advance width of `text` in px at `font.size`. */
  width(text: string, font: FontKey, style: StyleBits): number;
  metrics(font: FontKey): VerticalMetrics;
  /** Identifies the measurer in the determinism key (R-ARCH-6). */
  readonly id: string;
}

/** Sub- and superscript text is measured at the size divided by this (CSS `smaller`). */
export const SMALLER = 1.2;
