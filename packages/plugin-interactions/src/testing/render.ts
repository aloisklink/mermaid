/**
 * Renders through this repo's `mermaid.render`, standing in for v13's `createMermaid().render()`
 * in the specs: the svg, `bindFunctions`, and the v13 warnings the render logged.
 */
import mermaid from '@mermaid-js/core';
import { log } from '@mermaid-js/core/logger.js';
import { vi } from 'vitest';

export interface Rendered {
  readonly svg: string;
  readonly warnings: readonly { readonly code: string }[];
  readonly bindFunctions?: (element: Element) => void;
}

export async function render(id: string, text: string): Promise<Rendered> {
  const warn = vi.spyOn(log, 'warn');
  try {
    const { svg, bindFunctions } = await mermaid.render(id, text);
    // v13 diagrams log their warnings as `CODE: message`.
    const warnings = warn.mock.calls.flatMap(([message]) => {
      const code = /^([A-Z_]+): /.exec(String(message))?.[1];
      return code ? [{ code }] : [];
    });
    return { svg, warnings, bindFunctions };
  } finally {
    warn.mockRestore();
  }
}
