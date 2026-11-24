/**
 * Label layout and text measurers (DESIGN §5).
 */
export { Style, SMALLER } from './measurer.js';
export type { FontKey, Measurer, StyleBits, VerticalMetrics } from './measurer.js';
export { DEFAULT_FONT_FAMILY, familyNames, fontSizePx, resolveFontFamily } from './fonts.js';
export { tableMeasurer } from './table.js';
export { layoutLabel } from './label.js';
export type { BoxRun, LabelMarkup, LabelOptions, MeasuredLabel, Run } from './label.js';
export { decodeEntities, entityAt } from './entities.js';
export { inlineSpans } from './inline.js';
export type {
  InlinePairProvider,
  InlinePatternProvider,
  InlineProvider,
  InlineRequest,
  InlineSpans,
} from './inline.js';
export type { InlineBox, LabelBox, LabelBoxSpan, LabelSpan, SvgFragment } from '../svg/writer.js';
