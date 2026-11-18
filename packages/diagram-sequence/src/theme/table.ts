import type { DiagramThemeTable } from '@mermaid-js/core/v13/theme/index.js';
import { THEME_VARIABLE_TABLE } from './generated/variables.js';

/**
 * v12 `look: neo` (#194): the participant box corner (`svgDraw.js`); the glyph band of
 * `actorBands.ts` (`GLYPH_BAND_HEIGHT`), which also turns on its band model; the 3 px a message
 * stops short of its target (`sequenceRenderer.ts` `buildMessageModel`); the 15 px taller
 * fragment label tab (`svgDraw.js` `drawLoop`); the 30 px added below a diagram with
 * participants (`sequenceRenderer.ts` viewBox).
 */
const NEO = {
  actorRadius: 6,
  actorGlyphBand: 44,
  messageEndGap: 3,
  labelBoxExtraHeight: 15,
  actorFooterPadding: 30,
};

/** v12 classic: corner 3, no glyph band (per-shape symbols), and none of the neo extras. */
const CLASSIC = {
  actorRadius: 3,
  actorGlyphBand: 0,
  messageEndGap: 0,
  labelBoxExtraHeight: 0,
  actorFooterPadding: 0,
};

/**
 * Sequence's theme table (`DiagramPlugin.theme`, D331, spec #414 T2): its participant, message
 * and fragment colours, and its geometry by family.
 */
export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  // As v12 `theme-base.js` derives them. Where themes of one family write a colour differently,
  // it reads a shared input as each theme wrote it (`inline()`, D332), byte for byte.
  rules: {
    light: {
      // v12's label ink, which v12 derives `scaleLabelColor` from.
      actorTextColor: 'inline(scaleLabelColor)',
      actorLineColor: 'actorBorder',
      signalColor: 'inline(linkInkColor)',
      signalTextColor: 'inline(linkInkColor)',
      labelBoxBkgColor: 'actorBkg',
      // The fragment tab: the participant border unless the theme writes a frame border.
      labelBoxBorderColor: 'inline(frameBorder, actorBorder)',
      labelTextColor: 'actorTextColor',
      loopTextColor: 'actorTextColor',
      activationBkgColor: 'inline(mutedBkg)',
      activationBorderColor: 'inline(mutedBorder)',
      // Drawn in a circle filled with `lineColor`.
      sequenceNumberColor: 'inline(lineTextColor)',
    },
  },
  families: {
    classic: { tokens: CLASSIC },
    // v12 theme-redux-dark*.js draw messages in white, their text in the text ink.
    redux: { tokens: NEO, dark: { values: { signalColor: '#ffffff' } } },
    // The redux geometry, without redux's dark message colour.
    neo: { tokens: NEO },
  },
};
