import type { MathRenderer } from './diagrams/common/common.js';
import { setMathRendererLoader } from './diagrams/common/common.js';
import type { ExtensionPlugin } from './v13/pipeline/extensions.js';

/** Renders math (`$$...$$`) in diagram labels as MathML. */
export interface MathPlugin {
  type: 'math';
  /** Lazily loads the math renderer. */
  loader: () => Promise<MathRenderer>;
}

/** `afterMount`'s `result`. */
export interface ExtensionRenderResult {
  /** The v13 renderer's svg markup, not v12's final `RenderResult.svg`. */
  readonly svg: string;
}

/**
 * An extension plugin written against mermaid-v13's contract, such as
 * `@mermaid-js/plugin-interactions`. Only v13 diagrams run its hooks.
 */
export interface ExtensionPluginV13 {
  type: 'extension';
  extension: ExtensionPlugin<Element, ExtensionRenderResult>;
}

/** A plugin that adds optional functionality to mermaid. */
export type MermaidPlugin = MathPlugin | ExtensionPluginV13;

const extensions: ExtensionPluginV13['extension'][] = [];

/** The registered v13 extensions, in registration order. */
export const getExtensionsV13 = (): readonly ExtensionPluginV13['extension'][] => extensions;

/**
 * Registers plugins that add optional functionality to mermaid, such as math rendering or
 * mermaid-v13 extensions. An extension replaces one already registered with the same id.
 * Plugin packages export an array of plugins to pass to this function.
 */
export const registerPlugins = (plugins: MermaidPlugin[]) => {
  for (const plugin of plugins) {
    switch (plugin.type) {
      case 'math':
        setMathRendererLoader(plugin.loader);
        break;
      case 'extension': {
        const at = extensions.findIndex(({ id }) => id === plugin.extension.id);
        if (at < 0) {
          extensions.push(plugin.extension);
        } else {
          extensions[at] = plugin.extension;
        }
        break;
      }
      default:
        throw new Error(
          `Unknown mermaid plugin type: ${String((plugin as { type: unknown }).type)}`
        );
    }
  }
};
