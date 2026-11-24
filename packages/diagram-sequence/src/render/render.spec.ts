/**
 * The renderer reads its lengths in the render's units (`ctx.units`), as the layout did, not
 * from a fixed px profile (spec #125 final review, finding 11).
 */
import { describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/v13/config/index.js';
import { cellProfile, pxProfile } from '@mermaid-js/core/v13/layout/index.js';
import type { UnitProfile } from '@mermaid-js/core/v13/layout/index.js';
import { streamWriter } from '@mermaid-js/core/v13/svg/index.js';
import { tableMeasurer } from '@mermaid-js/core/v13/text/index.js';
import { layoutSequence } from '../layout/index.js';
import { parseSequence } from '../parser/index.js';
import { renderSequence } from './render.js';
import { testTheme } from '../theme/testTheme.js';

function svgWith(units: UnitProfile): string {
  const theme = testTheme('default');
  const config = { sequence: { showSequenceNumbers: true } } as unknown as ResolvedConfig;
  const { model } = parseSequence('sequenceDiagram\nA->>B: hi');
  const ctx = { config, theme, units, warn: () => {}, idPrefix: 's', version: '13' };
  const layout = layoutSequence(model, { ...ctx, measurer: tableMeasurer, units: pxProfile });
  const w = streamWriter();
  renderSequence(model, layout, ctx, w);
  return w.finish();
}

describe('renderSequence lengths', () => {
  it('come from the render context units', () => {
    const px = svgWith(pxProfile);
    expect(px).toMatch(/<circle[^>]* r="12"/);
    // Same layout, cell units: the badge radius is the cell table's, so the units were read.
    expect(svgWith(cellProfile())).not.toBe(px);
  });
});
