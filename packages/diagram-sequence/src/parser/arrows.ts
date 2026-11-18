/** Arrow token kinds and the model's arrow names (v12 `LINETYPE`, lower-cased). */
import type { ArrowKind } from '../model.js';
import { T } from './tokens.js';

/** Arrow token kind → model arrow kind (v12 `signaltype`). */
export const ARROW_KINDS: Readonly<Record<number, ArrowKind>> = {
  [T.SolidOpenArrow]: 'solid_open',
  [T.DottedOpenArrow]: 'dotted_open',
  [T.SolidArrow]: 'solid',
  [T.SolidArrowTop]: 'solid_top',
  [T.SolidArrowBottom]: 'solid_bottom',
  [T.StickArrowTop]: 'stick_top',
  [T.StickArrowBottom]: 'stick_bottom',
  [T.SolidArrowTopDotted]: 'solid_top_dotted',
  [T.SolidArrowBottomDotted]: 'solid_bottom_dotted',
  [T.StickArrowTopDotted]: 'stick_top_dotted',
  [T.StickArrowBottomDotted]: 'stick_bottom_dotted',
  [T.SolidArrowTopReverse]: 'solid_arrow_top_reverse',
  [T.SolidArrowBottomReverse]: 'solid_arrow_bottom_reverse',
  [T.StickArrowTopReverse]: 'stick_arrow_top_reverse',
  [T.StickArrowBottomReverse]: 'stick_arrow_bottom_reverse',
  [T.SolidArrowTopReverseDotted]: 'solid_arrow_top_reverse_dotted',
  [T.SolidArrowBottomReverseDotted]: 'solid_arrow_bottom_reverse_dotted',
  [T.StickArrowTopReverseDotted]: 'stick_arrow_top_reverse_dotted',
  [T.StickArrowBottomReverseDotted]: 'stick_arrow_bottom_reverse_dotted',
  [T.BidirectionalSolidArrow]: 'bidirectional_solid',
  [T.DottedArrow]: 'dotted',
  [T.BidirectionalDottedArrow]: 'bidirectional_dotted',
  [T.SolidCross]: 'solid_cross',
  [T.DottedCross]: 'dotted_cross',
  [T.SolidPoint]: 'solid_point',
  [T.DottedPoint]: 'dotted_point',
};

/** Every arrow token kind. */
export const ARROW_TOKENS: readonly number[] = Object.keys(ARROW_KINDS).map(Number);
