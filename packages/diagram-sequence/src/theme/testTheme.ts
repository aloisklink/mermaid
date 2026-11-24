import { themeFromV12 } from '@mermaid-js/core/diagram-api/themeV13.js';
import themes from '@mermaid-js/core/themes/index.js';
import type { Theme } from '@mermaid-js/core/v13/theme/index.js';
import { theme as table } from './table.js';

/** For tests: v12 theme `name` with `themeVariables` applied, resolved for sequence. */
export function testTheme(
  name: keyof typeof themes = 'default',
  themeVariables: Record<string, unknown> = {}
): Theme {
  return themeFromV12(
    { theme: name, themeVariables: themes[name].getThemeVariables(themeVariables) },
    table
  );
}
