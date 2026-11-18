/**
 * The theme types v13 diagrams use (v13's `theme/index.ts`, without v13's theme specs and
 * `createTheme`).
 */
export {
  composite,
  contrastRatio,
  formatColor,
  invertColor,
  luminance,
  mixColors,
  parseColor,
  type Rgba,
} from './color.js';
export type { ThemeRuleTable } from './spec.js';
export type {
  DiagramThemeEntries,
  DiagramThemeFamily,
  DiagramThemeTable,
  DiagramThemeVar,
  DiagramThemeVarDef,
  ThemeFamily,
} from './diagram.js';
export {
  ARROWHEAD_VARIABLES,
  BASE_VARIABLES,
  GIT_PALETTE_LIMIT,
  NUMBERED_PALETTES,
  PALETTE_LIMIT,
  PALETTE_LIMITS,
  PALETTE_VARIABLES,
  THEME_VARIABLES,
  TOKEN_VARIABLES,
  type ArrowheadVariable,
  type BaseVariable,
  type NumberedPalette,
  type PaletteVariable,
  type ThemeVarDef,
  type ThemeVarEntry,
  type ThemeVarKind,
  type TokenVariable,
} from './vocabulary.js';
export type { AliasName, AutoDeclarations, Theme, ThemeGradient } from './theme.js';
