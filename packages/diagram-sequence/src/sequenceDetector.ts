import type {
  DiagramDetector,
  DiagramLoaderV13,
  ExternalDiagramDefinitionV13,
} from '@mermaid-js/core/diagram-api/types.js';

const id = 'sequence';

const detector: DiagramDetector = (txt) => {
  return /^\s*sequenceDiagram/.test(txt);
};

const loader: DiagramLoaderV13 = async () => {
  const { sequence } = await import('./plugin.js');
  return { id, diagram: sequence, version: 13 };
};

const plugin: ExternalDiagramDefinitionV13 = {
  id,
  detector,
  loader,
};

export default plugin;
