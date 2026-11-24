/**
 * The sequence parser's tables: token sets for its decisions and the probe, the human names
 * of what it expects (R-ERR-2, R-ERR-5) and the statement hints. Built once at module load.
 */
import { ExpectedTable, Kind, kindSet, TRIVIA } from '@mermaid-js/core/v13/parser-kit/index.js';
import { idEscaper, STOP } from '@mermaid-js/core/v13/shared/parser/support.js';
import type { FragmentKind } from '../model.js';
import { ARROW_TOKENS } from './arrows.js';
import type { SequenceMenuStmt } from './ast.js';
import { T } from './tokens.js';

/** jison's `NEWLINE`: a line break, `;`, the alias state's empty match, the end of the text. */
export const LINE_END = [Kind.Newline, T.Semi, T.AliasEnd, T.Eof];
export const NEWLINE = kindSet(...LINE_END);
/** Where recovery resumes (R-PARSE-4). */
export const BOUNDARY = kindSet(Kind.EOF, ...LINE_END);
/**
 * `accDescr {` and its `}`: jison returns no token for them, so the parser skips them as it
 * skips comments; the statement is the text between.
 */
export const PARSER_TRIVIA = kindSet(
  ...[...TRIVIA.keys()].filter((k) => TRIVIA[k] === 1),
  T.AccDescrMultiline,
  T.AccDescrMultilineEnd
);
export const ACTOR = [T.Actor];
export const ACTOR_OR_LINK = [T.Actor, T.Link];
export const PARTICIPANT_KEYWORDS = [T.Participant, T.ParticipantActor, T.Destroy];
export const FRAGMENTS: Readonly<Record<number, FragmentKind>> = {
  [T.Loop]: 'loop',
  [T.Alt]: 'alt',
  [T.Opt]: 'opt',
  [T.Par]: 'par',
  [T.ParOver]: 'par_over',
  [T.Critical]: 'critical',
  [T.Break]: 'break',
};
/** The section keyword each fragment takes (`else`, `and`, `option`), if any. */
export const SECTION_OF: Partial<Record<FragmentKind, number>> = {
  alt: T.Else,
  par: T.And,
  par_over: T.And,
  critical: T.Option,
};
export const SECTION_NAMES: Readonly<Record<number, string>> = {
  [T.Else]: 'else',
  [T.And]: 'and',
  [T.Option]: 'option',
};
export const MENUS: Readonly<Record<number, SequenceMenuStmt['type']>> = {
  [T.Links]: 'Links',
  [T.Link]: 'Link',
  [T.Properties]: 'Properties',
  [T.Details]: 'Details',
};
export const STATEMENT_START = [
  T.Actor,
  T.Participant,
  T.ParticipantActor,
  T.Create,
  T.Destroy,
  T.Box,
  T.Autonumber,
  T.Activate,
  T.Deactivate,
  T.Note,
  T.Links,
  T.Link,
  T.Properties,
  T.Details,
  T.Title,
  T.LegacyTitle,
  T.AccTitle,
  T.AccDescr,
  T.AccDescrMultilineValue,
  T.Loop,
  T.Rect,
  T.Opt,
  T.Alt,
  T.Par,
  T.ParOver,
  T.Critical,
  T.Break,
];
// What the parser would accept at its decision points, for the probe (R-LANG-7, D95). Each
// list is a constant so a parse without a probe allocates nothing for them.
export const DOC_KINDS = [...STATEMENT_START, ...LINE_END, T.Invalid, Kind.EOF];
/** In a block: `end`, and the section keyword of the innermost fragment. */
export const BLOCK_KINDS = [...DOC_KINDS, T.End];
export const SECTION_KINDS: Readonly<Record<number, readonly number[]>> = {
  [T.Else]: [...BLOCK_KINDS, T.Else],
  [T.And]: [...BLOCK_KINDS, T.And],
  [T.Option]: [...BLOCK_KINDS, T.Option],
};
export const BOX_KINDS = [...PARTICIPANT_KEYWORDS, ...LINE_END, T.End];
export const HEADER = [T.SD];
export const HEADER_START = [...LINE_END, T.SD];
export const AFTER_ACTOR = [...ARROW_TOKENS, T.Parens];
export const AFTER_ARROW = [T.Plus, T.Minus, T.Parens, T.Actor, T.Link];
export const AFTER_CENTRAL_ARROW = [T.Parens, T.Actor, T.Link];
export const AFTER_PARTICIPANT = [T.As, T.ConfigStart, ...LINE_END];
export const AFTER_CONFIG = [T.As, ...LINE_END];
export const PLACEMENTS = [T.LeftOf, T.RightOf, T.Over];
export const AFTER_OVER = [T.Comma, T.Txt];
export const AFTER_AUTONUMBER = [T.Num, T.Off, ...LINE_END];
export const AFTER_NUM = [T.Num, ...LINE_END];
export const TXT = [T.Txt];
export const REST = [T.RestOfLine];
export const AS_REST = [T.RestOfLine];
export const CONFIG_CONTENT = [T.ConfigContent];
export const CONFIG_END = [T.ConfigEnd];
export const ACC_TITLE_VALUE = [T.AccTitleValue];
export const ACC_DESCR_VALUE = [T.AccDescrValue];

/**
 * Kinds a probe's cursor follows rather than extends when the token ends at the offset:
 * arrows and punctuation. Ids and text are absent, so a half-typed id is a word.
 */
export const PROBE_FOLLOWS = kindSet(...ARROW_TOKENS, T.Plus, T.Minus, T.Parens, T.Comma, T.Semi);

/** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
export const EXPECTED = new ExpectedTable([
  ['a participant id', [T.Actor, T.Link]],
  ['an arrow such as `->>`', ARROW_TOKENS],
  ['an activation sign such as `+`', [T.Plus, T.Minus]],
  ['a central connection `()`', [T.Parens]],
  ['a message text such as `: Hello`', [T.Txt]],
  ['`as`', [T.As]],
  ['participant data `@{ … }`', [T.ConfigStart]],
  ['the participant data', [T.ConfigContent]],
  ['`}`', [T.ConfigEnd]],
  ['a note position such as `left of`', PLACEMENTS],
  ['`,`', [T.Comma]],
  ['a number', [T.Num]],
  ['`off`', [T.Off]],
  ['a participant line such as `participant A`', PARTICIPANT_KEYWORDS],
  ['`end`', [T.End]],
  ['`else`', [T.Else]],
  ['`and`', [T.And]],
  ['`option`', [T.Option]],
  ['a line break or `;`', [Kind.Newline, T.Semi, T.AliasEnd]],
  ['a statement such as `participant` or `loop`', STATEMENT_START.filter((k) => k !== T.Actor)],
  ['`sequenceDiagram`', [T.SD]],
  ['text', [T.RestOfLine, T.AccTitleValue, T.AccDescrValue, T.AccDescrMultilineValue]],
  ['the end of the text', [Kind.EOF, T.Eof]],
]);

/** How each statement is written, for errors inside it. */
export const HINTS: Readonly<Record<number, string>> = {
  [T.Participant]: 'write it as `participant <id>` or `participant <id> as <label>`',
  [T.ParticipantActor]: 'write it as `actor <id>` or `actor <id> as <label>`',
  [T.Destroy]: 'write it as `destroy <id>`',
  [T.Create]: 'write it as `create participant <id>` or `create actor <id>`',
  [T.Note]:
    'write it as `note left of <id>: <text>`, `note right of <id>: <text>` or `note over <id>,<id>: <text>`',
  [T.Activate]: 'write it as `activate <id>`',
  [T.Deactivate]: 'write it as `deactivate <id>`',
  [T.Autonumber]:
    'write it as `autonumber`, `autonumber <start>`, `autonumber <start> <step>` or `autonumber off`',
  [T.Actor]: 'write a message as `<from><arrow><to>: <text>`, e.g. `Alice->>Bob: Hello`',
  [T.Links]: 'write it as `links <id>: {"label": "url"}`',
  [T.Link]: 'write it as `link <id>: <label> @ <url>`',
  [T.Properties]: 'write it as `properties <id>: {"key": "value"}`',
  [T.Details]: 'write it as `details <id>: <element id>`',
};

export { STOP };

/** `%`, `>`, `@` and `#` in names are percent-encoded in AST ids (as core's `AstIds`). */
export const esc = /* @__PURE__ */ idEscaper();

export const KEYWORD_NAMES: Readonly<Record<number, 'participant' | 'actor' | 'destroy'>> = {
  [T.Participant]: 'participant',
  [T.ParticipantActor]: 'actor',
  [T.Destroy]: 'destroy',
};
export const PLACEMENT_NAMES: Readonly<Record<number, 'left' | 'right' | 'over'>> = {
  [T.LeftOf]: 'left',
  [T.RightOf]: 'right',
  [T.Over]: 'over',
};
/** The fragments each section keyword divides, for errors. */
export const SECTION_OWNERS: Readonly<Record<number, string>> = {
  [T.Else]: '`alt`',
  [T.And]: '`par` or `par_over`',
  [T.Option]: '`critical`',
};
