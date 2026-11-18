import type { MathRenderer } from './diagrams/common/common.js';
import { setMathRendererLoader } from './diagrams/common/common.js';

/** Renders math (`$$...$$`) in diagram labels as MathML. */
export interface MathPlugin {
  type: 'math';
  /** Lazily loads the math renderer. */
  loader: () => Promise<MathRenderer>;
}

/** A plugin that adds optional functionality to mermaid. */
export type MermaidPlugin = MathPlugin;

/**
 * Registers plugins that add optional functionality to mermaid, such as math rendering.
 * Plugin packages export an array of plugins to pass to this function.
 */
export const registerPlugins = (plugins: MermaidPlugin[]) => {
  for (const plugin of plugins) {
    switch (plugin.type) {
      case 'math':
        setMathRendererLoader(plugin.loader);
        break;
      default:
        throw new Error(
          `Unknown mermaid plugin type: ${String((plugin as { type: unknown }).type)}`
        );
    }
  }
};
