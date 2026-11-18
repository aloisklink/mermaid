import { getDiagramLoader } from '@mermaid-js/core/diagram-api/detectType.js';
import { loadDiagram } from '@mermaid-js/core/diagram-api/loadDiagram.js';
import type { DiagramStylesProvider } from '@mermaid-js/core/diagram-api/types.js';

/** A registered diagram's stylesheet, through its loader like at render time. */
export const stylesOf = async (id: string): Promise<DiagramStylesProvider> =>
  (await loadDiagram(getDiagramLoader(id)!)).diagram.styles!;
