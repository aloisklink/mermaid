import { log } from '../logger.js';
import { detectors } from './detectType.js';
import { getDiagram, registerDiagram } from './diagramAPI.js';
import type { AnyDiagramLoader, DiagramDefinition } from './types.js';

/** Runs a diagram loader; a v13 diagram is wrapped as a v12 `DiagramDefinition` (the wrapper is imported on demand). */
export const loadDiagram = async (
  loader: AnyDiagramLoader
): Promise<{ id: string; diagram: DiagramDefinition }> => {
  const loaded = await loader();
  if (!('version' in loaded)) {
    return loaded;
  }
  const { fromDefinitionV13 } = await import('./diagramDefinitionV13.js');
  return { id: loaded.id, diagram: fromDefinitionV13(loaded.diagram) };
};

export const loadRegisteredDiagrams = async () => {
  log.debug(`Loading registered diagrams`);
  // Load all lazy loaded diagrams in parallel
  const results = await Promise.allSettled(
    Object.entries(detectors).map(async ([key, { detector, loader }]) => {
      if (!loader) {
        return;
      }
      try {
        getDiagram(key);
      } catch {
        try {
          // Register diagram if it is not already registered
          const { diagram, id } = await loadDiagram(loader);
          registerDiagram(id, diagram, detector);
        } catch (err) {
          // Remove failed diagram from detectors
          log.error(`Failed to load external diagram with key ${key}. Removing from detectors.`);
          delete detectors[key];
          throw err;
        }
      }
    })
  );
  const failed = results.filter((result) => result.status === 'rejected');
  if (failed.length > 0) {
    log.error(`Failed to load ${failed.length} external diagrams`);
    for (const res of failed) {
      log.error(res);
    }
    throw new Error(`Failed to load ${failed.length} external diagrams`);
  }
};
