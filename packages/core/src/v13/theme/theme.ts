/**
 * The types of v13's `theme/theme.ts`: the `Theme` a renderer reads its colours, lengths and
 * fonts from. v13's `createTheme` is not ported: `Theme` is implemented from v12's theme
 * variables instead.
 */
import type {
  Length,
  OutlinePaint,
  Paint,
  SafeColor,
  SafeFilter,
  SafeValue,
  StopColor,
  StyleText,
  ThemeRef,
} from '../svg/types.js';
import type { Rgba } from './color.js';
import type { PaletteVariable } from './vocabulary.js';

/** The render's gradient (D182), for the writer to emit as `<defs>`. */
export interface ThemeGradient {
  /** `<scope>-gradient`, the scope being the id prefix as an XML name (`styleScope`). */
  readonly id: string;
  readonly start: StopColor;
  readonly stop: StopColor;
}

/** A custom property name for the root `style`. */
export type AliasName = `--_${string}`;

/** One render's theme. It records which variables were used, so it is not shared. */
export interface Theme {
  readonly name: string;
  readonly dark: boolean;
  readonly cssVariables: boolean;
  /** A colour variable as paint: `var(--_x)`, or the literal colour. */
  color(name: string): Paint;
  /**
   * The paint for an outline (D182): the render's gradient when `useGradient` is on, else
   * {@link color}. Renderers call it where v12 neo strokes with the gradient.
   */
  outline(name: string): OutlinePaint;
  /** The gradient an {@link outline} refers to; undefined while `useGradient` is off. */
  gradient(): ThemeGradient | undefined;
  /** A length variable (stroke width, font size, token) for an attribute. */
  length(name: string): Length;
  /** A length or size variable as a number, for geometry and measuring. */
  number(name: string): number;
  /**
   * A `padding` variable as a number (D152): a px value as is, or a multiple of the diagram's
   * own `padding` config, which the caller passes.
   */
  padding(name: string, padding: number): number;
  /** The font family, for `font-family`. */
  font(name?: string): SafeValue | ThemeRef;
  /** A filter variable (`dropShadow`) for the `filter` attribute: `var(--_x)` or the literal. */
  filter(name: string): SafeFilter | ThemeRef;
  /** The variable's computed value as written in literal mode. */
  value(name: string): string;
  /** The variable's colour channels, when JS can compute them. */
  rgba(name: string): Rgba | undefined;
  /**
   * Ink for text on a fill the author chose (R-THEME-12): undefined when the theme's node
   * text reads on it, else a colour that does. Unknown and mostly transparent fills keep
   * the theme ink.
   */
  ink(fill: string): SafeColor | undefined;
  /** Declarations for the root `style`: the aliases used so far and what they depend on. */
  rootStyle(): Readonly<Record<AliasName, ThemeRef>>;
  /** {@link rootStyle} as checked `style` text, to pass as the tail of `styleText`. */
  rootStyleText(): StyleText;
  /** The colour aliases for light and dark, for `theme: 'auto'`; undefined otherwise. */
  autoDeclarations(): AutoDeclarations | undefined;
  /**
   * A palette as literal colours (D151, D152): the author's `themeVariables` list if valid,
   * else the theme's; empty when the theme carries none. `name` is a shared palette
   * (`PALETTE_VARIABLES`) or a `palette` variable of the diagram's table, which reads the shared
   * palette its rule names unless the author lists its own (D545).
   */
  palette(name: PaletteVariable | (string & {})): readonly SafeColor[];
  /** {@link palette}'s entries as colour channels, where JS can compute them. */
  paletteRgba(name: PaletteVariable | (string & {})): readonly (Rgba | undefined)[];
}

export interface AutoDeclarations {
  readonly light: Readonly<Record<AliasName, ThemeRef>>;
  readonly dark: Readonly<Record<AliasName, ThemeRef>>;
}
