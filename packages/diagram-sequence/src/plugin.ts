import type {
  DiagramParseContext,
  DiagramPlugin,
  RenderContext,
} from '@mermaid-js/core/v13/index.js';
import type { SvgWriter } from '@mermaid-js/core/v13/svg/index.js';
import { resolveLimits } from '@mermaid-js/core/v13/limits/index.js';
import type { SequenceModel } from './model.js';
import { layoutSequence, type SequenceLayout } from './layout/index.js';
import { detectSequence, parseSequence, type SequenceParseResult } from './parser/index.js';
import { renderSequence } from './render/index.js';
import { sequenceLabels } from './labels.js';
import { theme } from './theme/table.js';

/**
 * The sequence diagram plugin (DESIGN §12.1, spec #125): `layoutKind: 'custom'` with its own
 * `SequenceLayout`. `parse` takes the whole source; `layout` measures and places everything;
 * `render` writes the whole `<svg>` document into the writer. The registry loads it from the
 * package's `mermaid` manifest, with the text hook from `./ascii` (#145).
 */
export const sequence = {
  id: 'sequence',
  // v13's text output (`ascii`) is not ported.
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  detector: (text: string): boolean => detectSequence(text),
  parse: (text: string, ctx: DiagramParseContext): SequenceParseResult => {
    const caps = ctx.limits ?? resolveLimits(ctx.config);
    return parseSequence(text, {
      preprocessed: ctx.preprocessed,
      maxEdges: caps.maxEdges,
      maxNodes: caps.maxNodes,
      maxDepth: caps.maxDepth,
    });
  },
  labels: sequenceLabels,
  layout: (model: SequenceModel, ctx: RenderContext): SequenceLayout => layoutSequence(model, ctx),
  render: (model: SequenceModel, layout: SequenceLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderSequence(model, layout, ctx, w),
  theme,
} satisfies DiagramPlugin<SequenceModel, SequenceLayout>;
