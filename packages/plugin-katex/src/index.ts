import type { MermaidPlugin } from '@mermaid-js/core';

/** KaTeX math rendering, to pass to `mermaid.registerPlugins`. */
const plugins: MermaidPlugin[] = [
  {
    type: 'math',
    loader: async () => (await import('katex')).default,
  },
];

export default plugins;
