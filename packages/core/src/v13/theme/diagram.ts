/**
 * A diagram's own theme variables (D331, spec #414): plain data on `DiagramPlugin.theme`, loaded
 * with the diagram chunk, so core's bundle never carries them (R-PERF-8). A table is keyed by
 * theme traits (`ThemeSpec.family` and `ThemeSpec.dark`), never by a theme name, so a new theme
 * that declares a family themes every diagram without naming one of its variables.
 *
 * Dependencies run one way (D331): core and the theme specs never name a diagram's variable, a
 * diagram never names a theme, and a table's rules read only the shared vocabulary
 * (`vocabulary.ts`), palette slots and the table's own `vars`. The direction check
 * (`tools/gen-config/src/theme-direction.spec.ts`) enforces all three.
 */
import type { ThemeRuleTable } from './spec.js';
import type { ThemeVarEntry } from './vocabulary.js';

/**
 * The theme families (D331): `classic` (default, dark, forest, neutral, base), `redux` (the four
 * redux themes) and `neo` (neo, neo-dark). The one list `ThemeFamily` and the direction check
 * (which lets a table's `fallback` name one) both take.
 */
export const THEME_FAMILIES = ['classic', 'redux', 'neo'] as const;

/** A theme's family (D331, `THEME_FAMILIES`): which of a table's family entries apply. */
export type ThemeFamily = (typeof THEME_FAMILIES)[number];

/** Literal values and rules for one family, or for that family's dark themes. */
export interface DiagramThemeEntries {
  /**
   * Rules over the table's `rules` and the theme spec's own rules (the precedence of today's
   * layers: shared and diagram rules, then the theme's, then these, then a plugin fragment's).
   */
  readonly rules?: ThemeRuleTable;
  /** Literal colours, fonts or filters. They beat every rule, as a theme spec's `values` do. */
  readonly values?: Readonly<Record<string, string>>;
  /** Literal geometry: lengths, paddings (`'2 * padding'`), opacities and flags. Beat every rule. */
  readonly tokens?: Readonly<Record<string, number | string | boolean>>;
}

/** A table's entries for one family. */
export interface DiagramThemeFamily extends DiagramThemeEntries {
  /** Entries for the family's dark themes (`ThemeSpec.dark`), over the ones above. */
  readonly dark?: DiagramThemeEntries;
  /**
   * The family whose entries apply beneath these, each level with its own dark entries
   * (timeline under `neo` takes `classic` geometry, D331). None when absent: only the table's
   * `rules` apply beneath.
   */
  readonly fallback?: ThemeFamily;
}

/** One of a table's variables: its private alias and kind, and its nested key (D335, D540). */
export interface DiagramThemeVar extends ThemeVarEntry {
  /**
   * Its key under the table's `section`: `themeVariables.packet.startByteColor` sets the
   * variable `packetStartByteColor` when this is `startByteColor`. Mapped key by key, never by
   * prefix; the flat name wins when an author sets both (D540).
   */
  readonly nested?: string;
}

/**
 * A row of a diagram package's `src/theme/vocabulary.ts` (spec #414 T0b): a {@link DiagramThemeVar}
 * and the types that read it, as core's `ThemeVarDef`. Tools and specs read it as data;
 * `pnpm gen:theme` writes the runtime half (no `usedBy`) to `src/theme/generated/variables.ts`.
 */
export interface DiagramThemeVarDef extends DiagramThemeVar {
  /** The package's own type, or nothing while no source reads it: another reader means core. */
  readonly usedBy: readonly string[];
}

/** `DiagramPlugin.theme` (D331, DESIGN §12.1). */
export interface DiagramThemeTable {
  /** The nested `themeVariables` key v12 reads (`packet`), for the vars that set `nested`. */
  readonly section?: string;
  /**
   * The diagram's variables by v12 name. A name core already defines is ignored here; a plugin
   * fragment rule with the same name loses to the table (D337).
   */
  readonly vars: Readonly<Record<string, DiagramThemeVar>>;
  /**
   * Rules beside the shared light and dark rules (`spec.ts`). `dark` holds the rules that
   * replace `light`'s under a dark theme or `themeVariables.darkMode`, as `DARK_RULES` does.
   */
  readonly rules: { readonly light: ThemeRuleTable; readonly dark?: ThemeRuleTable };
  /** Entries by family, each stating its own fallback. */
  readonly families?: Readonly<Partial<Record<ThemeFamily, DiagramThemeFamily>>>;
}
