/**
 * Sequence detection, as v12's detector saw the text (`/^\s*sequenceDiagram/` after the front
 * matter, with directives and `%%` comments removed).
 */
import { diagramStart, preprocess } from '@mermaid-js/core/v13/preprocess/index.js';
import type { PreprocessResult } from '@mermaid-js/core/v13/preprocess/index.js';

export function detectSequence(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('sequenceDiagram', diagramStart(src, pre));
}
