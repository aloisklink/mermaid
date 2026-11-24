/**
 * Sequence AST (R-PARSE-8, DESIGN §4.2 adapted). Every node has a semantic id built from the
 * user's names, and a range into the original source:
 *
 * | element                                   | id                       |
 * | ----------------------------------------- | ------------------------ |
 * | first mention of participant `A`          | `p:A`                    |
 * | a later mention or declaration of `A`     | `p:A@2`, `p:A@3`, …      |
 * | message `A->>B`                           | `m:A>B`, then `m:A>B#2`  |
 * | note                                      | `note:<ordinal>`         |
 * | fragment (`loop`, `alt`, …)               | `f:<kind>#<ordinal>`     |
 * | box                                       | `box:<ordinal>`          |
 * | any other statement (`activate`, `destroy`, `rect`, `else`, `autonumber`, `title`, menus, …) | `st:<ordinal>` |
 *
 * Names are written as they are, except that `%`, `>`, `@` and `#` are percent-encoded (`%25`,
 * `%3E`, `%40`, `%23`), so the suffixes stay unambiguous; spaces and other characters are kept.
 * The first mention or message has no suffix; the n-th later one takes `@n` (participants) or
 * `#n` (messages between the same two participants, counted from 2). For example:
 * `participant A B` is `p:A B`; `participant A#c` is `p:A%23c`; the first `A->>B#2` is
 * `m:A>B%232`; the second `A->>B` is `m:A>B#2`.
 *
 * The first mention of a participant is the AST node whose id the model's participant keeps
 * (`p:A`): a declaration (`participant A`) or a reference inside a message, note or menu
 * statement, whichever comes first. `activate`, `deactivate` and `destroy` add no participant
 * (as in v12), so they take no `p:` id.
 */
import type { AstMenu, AstNode, Range } from '@mermaid-js/core/v13/parser-kit/index.js';
import type { ArrowKind, FragmentKind } from '../model.js';

/** A participant id inside a message, note, activation or menu statement. */
export interface SequenceParticipantRef extends AstNode<'ParticipantRef'> {
  name: string;
}

/**
 * `participant A`, `actor A as Alice`, `participant A@{ … }`, `create …`, `destroy A`. A plain
 * `destroy` adds no participant, so its id is `st:<ordinal>`, not `p:`.
 */
export interface SequenceParticipantStmt extends AstNode<'Participant'> {
  keyword: 'participant' | 'actor' | 'destroy';
  /** Written after `create`. */
  create?: boolean;
  name: string;
  nameRange: Range;
  /** The `as …` text as written (wrap prefix included), and its range. */
  alias?: { text: string; range: Range };
  /** The `@{ … }` block, braces included. */
  dataRange?: Range;
}

export interface SequenceMessageStmt extends AstNode<'Message'> {
  from: string;
  to: string;
  arrow: ArrowKind;
  /** The message text after `:`, as the model holds it. */
  text: string;
  /** Range of the arrow, with the `+`, `-` and `()` around it. */
  arrowRange: Range;
  children: SequenceParticipantRef[];
}

export interface SequenceNoteStmt extends AstNode<'Note'> {
  placement: 'left' | 'right' | 'over';
  text: string;
  children: SequenceParticipantRef[];
}

/** `activate A` / `deactivate A`. It adds no participant, so it holds no `p:` reference. */
export interface SequenceActivationStmt extends AstNode<'Activation'> {
  active: boolean;
  participant: string;
  nameRange: Range;
}

/** `else …`, `and …` or `option …`: a later section of a fragment. */
export interface SequenceSectionStmt extends AstNode<'Section'> {
  label: string;
  children: SequenceStatementNode[];
}

/**
 * `loop …`, `alt …`, `opt …`, `par …`, `par_over …`, `critical …` or `break …` up to `end`.
 * The first section's statements are children of the fragment, then one
 * {@link SequenceSectionStmt} per later section.
 */
export interface SequenceFragmentStmt extends AstNode<'Fragment'> {
  fragment: FragmentKind;
  label: string;
  children: SequenceStatementNode[];
}

export interface SequenceRectStmt extends AstNode<'Rect'> {
  color: string;
  children: SequenceStatementNode[];
}

export interface SequenceBoxStmt extends AstNode<'Box'> {
  label: string;
  color?: string;
  children: SequenceParticipantStmt[];
}

export interface SequenceAutonumberStmt extends AstNode<'Autonumber'> {
  start?: number;
  step?: number;
  visible: boolean;
}

/** `title`, `accTitle` and `accDescr`. */
export interface SequenceTextStmt extends AstNode<'Title' | 'AccTitle' | 'AccDescr'> {
  text: string;
}

/**
 * An actor menu statement (D105): `links A: {json}`, `link A: label @ url`,
 * `properties A: {json}` or `details A: elementId`. The diagram parses it; the interactions
 * plugin acts on it. `links` and `properties` carry the parsed JSON (undefined, with a warning,
 * when it is not a JSON object), `link` gives its label and URL as v12 split them (in
 * `links`), and `details` keeps the id of the element v12 read the menu from in `text`.
 */
export interface SequenceMenuStmt extends AstNode<'Links' | 'Link' | 'Properties' | 'Details'> {
  participant: string;
  /** The text after `:`, as written (trimmed). */
  text: string;
  links?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  /**
   * The same menu for the interactions plugin (`AstMenu`, #147); the svg never draws it. A
   * later declaration of the target with a label drops it, as v12 dropped the merged menus.
   */
  menu?: AstMenu;
  children: SequenceParticipantRef[];
}

/** `sequenceDiagram`. */
export type SequenceHeader = AstNode<'Header'>;

export type SequenceStatementNode =
  | SequenceHeader
  | SequenceParticipantStmt
  | SequenceMessageStmt
  | SequenceNoteStmt
  | SequenceActivationStmt
  | SequenceFragmentStmt
  | SequenceSectionStmt
  | SequenceRectStmt
  | SequenceBoxStmt
  | SequenceAutonumberStmt
  | SequenceTextStmt
  | SequenceMenuStmt;

export interface SequenceDocument extends AstNode<'Document'> {
  children: SequenceStatementNode[];
}
