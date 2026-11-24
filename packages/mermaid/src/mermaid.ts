import mermaid from '@mermaid-js/core';
import coseBilkentLayouts from '@mermaid-js/layout-cose-bilkent';
import elkLayouts from '@mermaid-js/layout-elk';
import interactionsPlugins from '@mermaid-js/plugin-interactions';
import katexPlugins from '@mermaid-js/plugin-katex';
import { diagrams } from './diagrams.js';

mermaid.registerLayoutLoaders([...coseBilkentLayouts, ...elkLayouts]);
mermaid.registerPlugins([...interactionsPlugins, ...katexPlugins]);
void mermaid.registerExternalDiagrams(diagrams);

export * from '@mermaid-js/core';
export default mermaid;
