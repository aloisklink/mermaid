import type { MermaidConfig } from '../config.type.js';
import { checkColor, checkFilter, checkStyle, styleText } from '../v13/svg/style.js';
import type { Paint, SafeColor, SafeFilter, SafeValue } from '../v13/svg/types.js';
import { parseColor, type Rgba } from '../v13/theme/color.js';
import type { DiagramThemeFamily, DiagramThemeTable, ThemeFamily } from '../v13/theme/diagram.js';
import type { Theme } from '../v13/theme/theme.js';

/** v13's shadows, for the families that draw one, where v12's value is not a CSS filter. */
const SHADOWS: Readonly<Record<Exclude<ThemeFamily, 'classic'>, { light: string; dark: string }>> =
  {
    neo: {
      light: 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.25))',
      dark: 'drop-shadow(1px 2px 2px rgb(185 185 185 / 0.2))',
    },
    redux: {
      light: 'drop-shadow(4px 4px 0 rgb(0 0 0 / 0.06))',
      dark: 'drop-shadow(4px 4px 0 rgb(255 255 255 / 0.06))',
    },
  };

/** A theme variable as text: v12 writes them as strings, or numbers for some lengths. */
const text = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : '';

/** The v13 theme family of a v12 theme: its geometry and whether it draws shadows. */
function familyOf(config: MermaidConfig): ThemeFamily {
  const theme = config.theme ?? 'default';
  if (theme.startsWith('redux')) {
    return 'redux';
  }
  if (theme.startsWith('neo') || config.look === 'neo') {
    return 'neo';
  }
  return 'classic';
}

/** The table's values and rules for `family`: fallback families first, dark entries last. */
function tableEntries(table: DiagramThemeTable | undefined, family: ThemeFamily, dark: boolean) {
  const values: Record<string, unknown> = {};
  const rules: Record<string, string> = {
    ...table?.rules.light,
    ...(dark ? table?.rules.dark : undefined),
  };
  const chain: DiagramThemeFamily[] = [];
  for (
    let f = table?.families?.[family];
    f && !chain.includes(f);
    f = f.fallback && table?.families?.[f.fallback]
  ) {
    chain.unshift(f);
  }
  for (const f of chain) {
    for (const entries of dark ? [f, f.dark] : [f]) {
      Object.assign(values, entries?.values, entries?.tokens);
      Object.assign(rules, entries?.rules);
    }
  }
  return { values, rules };
}

/**
 * A v13 {@link Theme} that reads v12's theme variables (`config.themeVariables`, which v12's
 * theme classes have already computed), so that v13 diagrams follow v12's themes.
 *
 * Variables v12 does not have, such as geometry, come from the diagram's theme table: its
 * family's values, then its rules when a rule names other variables (`a`, `inline(a, b)`).
 */
export function themeFromV12(config: MermaidConfig, table?: DiagramThemeTable): Theme {
  const v12: Record<string, unknown> = config.themeVariables ?? {};
  const family = familyOf(config);
  // v12's dark themes don't set `darkMode`.
  const dark = Boolean(v12.darkMode) || /(^|-)dark(-|$)/.test(config.theme ?? '');
  const { values, rules } = tableEntries(table, family, dark);
  // v12's `dropShadow` may name an SVG filter, which v13 diagrams do not define.
  const shadow = checkFilter(text(v12.dropShadow).replace(/;\s*$/, ''));
  const vars: Record<string, unknown> = {
    ...v12,
    fontFamily: v12.fontFamily || config.fontFamily,
    dropShadow:
      family === 'classic' ? 'none' : (shadow ?? SHADOWS[family][dark ? 'dark' : 'light']),
  };

  const raw = (name: string, seen = new Set<string>()): unknown => {
    const v = vars[name] ?? values[name];
    if (v !== undefined && v !== '') {
      return v;
    }
    const rule = rules[name];
    if (rule === undefined || seen.has(name)) {
      return undefined;
    }
    seen.add(name);
    const names = /^inline\((.*)\)$/.exec(rule)?.[1] ?? rule;
    for (const other of names.split(',')) {
      const found = raw(other.trim(), seen);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  };

  const value = (name: string): string => text(raw(name));
  const number = (name: string): number => parseFloat(value(name));
  const color = (name: string): Paint => checkColor(value(name)) ?? 'none';
  const palette = (name: string): SafeColor[] => {
    const list = raw(name);
    return Array.isArray(list) ? list.flatMap((c) => checkColor(String(c).trim()) ?? []) : [];
  };

  return {
    name: config.theme ?? 'default',
    dark,
    cssVariables: false,
    color,
    outline: color,
    gradient: () => undefined,
    length: number,
    number,
    padding: (name, padding) => {
      const n = number(name);
      return Number.isFinite(n) ? n : padding;
    },
    font: () =>
      (checkStyle(['font-family:' + value('fontFamily')]).text['font-family'] ??
        'sans-serif') as SafeValue,
    filter: (name) => (checkFilter(value(name)) ?? 'none') as SafeFilter,
    value,
    rgba: (name): Rgba | undefined => parseColor(value(name)),
    ink: () => undefined,
    rootStyle: () => ({}),
    rootStyleText: () => styleText({}),
    autoDeclarations: () => undefined,
    palette,
    paletteRgba: (name) => palette(name).map(parseColor),
  };
}
