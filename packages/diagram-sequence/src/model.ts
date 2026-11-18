/**
 * SequenceModel: the plain-data result of a sequence parse (spec #125 §Parser), and the input of
 * the sequence layout. Source order is kept (R-ARCH-7): participants in first-mention order, and
 * one ordered statement list in which fragments and `rect` blocks nest their own statements.
 *
 * Shared contract (run notes GAPS.md): #141 lands the type, #139 adopts it and may extend it
 * additively. Text is kept as written (no sanitising); `<br>` and entity codes are resolved when
 * labels are measured and drawn.
 *
 * What the parser guarantees, as v12's DB did:
 * - every id a message or note names is in `participants` (v12 adds a participant at its
 *   first mention). `activate X` / `deactivate X` do not add one (v12 did not either, and its
 *   renderer failed on such an activation): the layout leaves out a statement that names an
 *   undeclared participant, with a `SEQUENCE_UNKNOWN_PARTICIPANT` warning, and
 *   `sequenceLayoutViolations` reports it;
 * - `autonumber N` is `{ start: N, step: 1 }` (v12 restarts the step), `autonumber N M` is
 *   `{ start: N, step: M }`, a bare `autonumber` and `autonumber off` carry neither.
 */
import type { AstId, Diagnostic } from '@mermaid-js/core/v13/parser-kit/index.js';

/**
 * v12's participant types (`PARTICIPANT_TYPE`), in its order: the one list the parser, the
 * language facet and the layout read.
 */
export const PARTICIPANT_KINDS = [
  'participant',
  'actor',
  'boundary',
  'control',
  'entity',
  'database',
  'collections',
  'queue',
] as const;

export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];

export interface SequenceParticipant {
  readonly id: string;
  /** `p:<id>`. */
  readonly ast: AstId;
  /** The description: the alias when one was given, else the id. */
  readonly label: string;
  readonly kind: ParticipantKind;
  /** `wrap:`/`nowrap:` as written; undefined follows `sequence.wrap`. */
  readonly wrap?: boolean;
  /** Index into `SequenceModel.boxes`. */
  readonly box?: number;
  /** AST id of the `create participant …` statement. */
  readonly createAst?: AstId;
  /** AST id of the message that creates it: the next message after `create`. */
  readonly createdBy?: AstId;
  /** AST id of the `destroy …` statement. */
  readonly destroyAst?: AstId;
  /** AST id of the message that destroys it: the next message after `destroy`. */
  readonly destroyedBy?: AstId;
  /**
   * Actor menu links from `links`/`link` statements, merged in order as v12 merged them; a
   * redeclaration with a label resets them (as v12). For `plugin-interactions` (D105).
   */
  readonly links?: Readonly<Record<string, unknown>>;
  /** Actor menu properties from `properties` statements, merged the same way. */
  readonly properties?: Readonly<Record<string, unknown>>;
}

export interface SequenceBox {
  /** `box:<ordinal>`. */
  readonly ast: AstId;
  readonly label: string;
  /** The colour as written; undefined is transparent. */
  readonly color?: string;
  readonly wrap?: boolean;
  /** Member ids in declaration order. */
  readonly participants: readonly string[];
}

/**
 * v12's message line types (`LINETYPE`), lower-cased: `solid` is `->>`, `dotted` `-->>`,
 * `solid_open` `->`, `solid_cross` `-x`, `solid_point` `-)`, `bidirectional_solid` `<<->>`, and
 * the half-arrow families (`solid_top` `-|\`, `stick_arrow_bottom_reverse_dotted` `//--`, …).
 */
export type ArrowKind =
  | 'solid'
  | 'dotted'
  | 'solid_cross'
  | 'dotted_cross'
  | 'solid_open'
  | 'dotted_open'
  | 'solid_point'
  | 'dotted_point'
  | 'bidirectional_solid'
  | 'bidirectional_dotted'
  | 'solid_top'
  | 'solid_bottom'
  | 'stick_top'
  | 'stick_bottom'
  | 'solid_arrow_top_reverse'
  | 'solid_arrow_bottom_reverse'
  | 'stick_arrow_top_reverse'
  | 'stick_arrow_bottom_reverse'
  | 'solid_top_dotted'
  | 'solid_bottom_dotted'
  | 'stick_top_dotted'
  | 'stick_bottom_dotted'
  | 'solid_arrow_top_reverse_dotted'
  | 'solid_arrow_bottom_reverse_dotted'
  | 'stick_arrow_top_reverse_dotted'
  | 'stick_arrow_bottom_reverse_dotted';

/** A head v12 drew with a marker: its marker families. */
export type ArrowHead =
  | 'arrow'
  | 'open'
  | 'cross'
  | 'solidTop'
  | 'solidBottom'
  | 'stickTop'
  | 'stickBottom';

/**
 * The heads each arrow draws (v12 `marker-start` and `marker-end`): the one table the svg and
 * text renderers draw from and the layout's head gaps are read from. A start head is turned
 * back along the line (`auto-start-reverse`), so a top reverse arrow starts with a bottom head.
 */
export const ARROW_HEADS: Readonly<
  Record<ArrowKind, { readonly start?: ArrowHead; readonly end?: ArrowHead }>
> = {
  solid: { end: 'arrow' },
  dotted: { end: 'arrow' },
  solid_cross: { end: 'cross' },
  dotted_cross: { end: 'cross' },
  solid_open: {},
  dotted_open: {},
  solid_point: { end: 'open' },
  dotted_point: { end: 'open' },
  bidirectional_solid: { start: 'arrow', end: 'arrow' },
  bidirectional_dotted: { start: 'arrow', end: 'arrow' },
  solid_top: { end: 'solidTop' },
  solid_bottom: { end: 'solidBottom' },
  stick_top: { end: 'stickTop' },
  stick_bottom: { end: 'stickBottom' },
  solid_arrow_top_reverse: { start: 'solidBottom' },
  solid_arrow_bottom_reverse: { start: 'solidTop' },
  stick_arrow_top_reverse: { start: 'stickBottom' },
  stick_arrow_bottom_reverse: { start: 'stickTop' },
  solid_top_dotted: { end: 'solidTop' },
  solid_bottom_dotted: { end: 'solidBottom' },
  stick_top_dotted: { end: 'stickTop' },
  stick_bottom_dotted: { end: 'stickBottom' },
  solid_arrow_top_reverse_dotted: { start: 'solidBottom' },
  solid_arrow_bottom_reverse_dotted: { start: 'solidTop' },
  stick_arrow_top_reverse_dotted: { start: 'stickBottom' },
  stick_arrow_bottom_reverse_dotted: { start: 'stickTop' },
};

export interface SequenceMessage {
  readonly kind: 'message';
  /** `m:<from>><to>#<k>`. */
  readonly ast: AstId;
  readonly from: string;
  readonly to: string;
  readonly text: string;
  readonly wrap?: boolean;
  readonly arrow: ArrowKind;
  /** The `+` (activates `to`) or `-` (deactivates `from`) shorthand. */
  readonly activation?: 'activate' | 'deactivate';
  /**
   * Central connection `()`: `to` for `A->>()B`, `from` for `A()->>B`, `both` for
   * `A()->>()B`. As in v12, each opens an activation on its participant.
   */
  readonly central?: 'to' | 'from' | 'both';
}

export interface SequenceNote {
  readonly kind: 'note';
  /** `note:<ordinal>`. */
  readonly ast: AstId;
  readonly placement: 'left' | 'right' | 'over';
  /** One participant, or two for `over A,B`. */
  readonly participants: readonly [string] | readonly [string, string];
  readonly text: string;
  readonly wrap?: boolean;
}

/** `activate A` / `deactivate A`. */
export interface SequenceActivation {
  readonly kind: 'activation';
  /** `st:<ordinal>`. */
  readonly ast: AstId;
  readonly participant: string;
  readonly active: boolean;
}

export type FragmentKind = 'loop' | 'alt' | 'opt' | 'par' | 'par_over' | 'critical' | 'break';

/**
 * One section of a fragment: the first holds the fragment's own label, the others follow an
 * `else`, `and` or `option` line.
 */
export interface FragmentSection {
  /** AST id of the `else`/`and`/`option` line; undefined for the first section. */
  readonly ast?: AstId;
  readonly label: string;
  /** `wrap:`/`nowrap:` as written; v12 wraps fragment titles to the fragment either way. */
  readonly wrap?: boolean;
  readonly statements: readonly SequenceStatement[];
}

export interface SequenceFragment {
  readonly kind: 'fragment';
  /** `f:<kind>#<ordinal>`. */
  readonly ast: AstId;
  readonly fragment: FragmentKind;
  readonly sections: readonly FragmentSection[];
}

/** `rect <colour> … end` background highlighting. */
export interface SequenceRect {
  readonly kind: 'rect';
  /** `st:<ordinal>`. */
  readonly ast: AstId;
  /** The colour as written; empty for the theme default. */
  readonly color: string;
  readonly statements: readonly SequenceStatement[];
}

/** `autonumber [start [step]]` or `autonumber off`. */
export interface SequenceAutonumber {
  readonly kind: 'autonumber';
  /** `st:<ordinal>`. */
  readonly ast: AstId;
  readonly start?: number;
  /** The parser writes 1 for `autonumber N`; the layout does the same when it is missing. */
  readonly step?: number;
  readonly visible: boolean;
}

export type SequenceStatement =
  | SequenceMessage
  | SequenceNote
  | SequenceActivation
  | SequenceFragment
  | SequenceRect
  | SequenceAutonumber;

export interface SequenceModel {
  /** First-mention order, which is the column order. */
  readonly participants: readonly SequenceParticipant[];
  readonly boxes: readonly SequenceBox[];
  readonly statements: readonly SequenceStatement[];
  readonly title?: string;
  readonly accTitle: string;
  readonly accDescr: string;
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  readonly warnings: readonly Diagnostic[];
}
