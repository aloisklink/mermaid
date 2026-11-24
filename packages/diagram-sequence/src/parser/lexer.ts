/**
 * Sequence lexer: a state machine mirroring the start conditions and rule order of v12's
 * `sequenceDiagram.jison` (parser-method §1), modelled on the flowchart lexer:
 * - it lexes the text v12 lexed, with comments and directives cut out ({@link sourceView}), and
 *   maps each token back to its range in the source, which is never rewritten. A token that
 *   runs over a removed span is one token whose range covers it;
 * - comments and directives are trivia tokens, each with its own range, in source order; so
 *   are the `#`, `%` and `x%%` comments the jison lexer skipped;
 * - where jison threw (no rule matched), an `Error` token is written and lexing carries on in
 *   the initial state (for recovery).
 *
 * jison facts it reproduces: the first rule in order wins (no longest match); the lexer is
 * case-insensitive (ASCII letters only); keyword literals end in `\b`; `\n` in a rule is LF
 * only, while `\s` and `trim()` take every line terminator. Every scan is linear in the text
 * it consumes (R-PARSE-7).
 */
// cspell:words sequencediagram acctitle accdescr
import {
  AT,
  BACKSLASH,
  codePointEnd,
  COLON,
  COMMA,
  CR,
  DASH,
  DOT,
  GT,
  HASH,
  isDigit,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LF,
  LPAREN,
  LT,
  PERCENT,
  PIPE,
  type Probe,
  RBRACE,
  RPAREN,
  SEMI,
  SLASH,
  type SourceView,
  type TokenStream,
} from '@mermaid-js/core/v13/parser-kit/index.js';
import {
  lowerCode,
  StateLexer,
  type StateLexerOptions,
} from '@mermaid-js/core/v13/shared/parser/state.js';
import { T } from './tokens.js';

// Start conditions of sequenceDiagram.jison (`CONFIG_DATA` is declared there, never entered).
const S = {
  INITIAL: 0,
  ID: 1,
  ALIAS: 2,
  LINE: 3,
  CONFIG: 4,
  acc_title: 5,
  acc_descr: 6,
  acc_descr_multiline: 7,
} as const;

/** Start condition names by number, for the probe's lexer mode. */
const S_NAMES: readonly string[] = [
  'INITIAL',
  'ID',
  'ALIAS',
  'LINE',
  'CONFIG',
  'acc_title',
  'acc_descr',
  'acc_descr_multiline',
];

/** What a keyword rule does after its literal. */
const B = {
  /** `\b`: the next character is not a word character. */
  Word: 0,
  /** `(?=[ \t]+[^/\\+()<>:\n,;\s-])`: the menu keywords `links`, `link`, … */
  Menu: 1,
} as const;

interface Keyword {
  /** Lower case. */
  word: string;
  kind: number;
  /** The state it begins, or -1. */
  begin: number;
  boundary: number;
}

const kw = (word: string, kind: number, begin = -1, boundary: number = B.Word) => ({
  word,
  kind,
  begin,
  boundary,
});

/** The INITIAL keyword literals, in rule order (built once). */
const KEYWORDS: readonly Keyword[] = [
  kw('box', T.Box, S.LINE),
  kw('participant', T.Participant, S.ID),
  kw('actor', T.ParticipantActor, S.ID),
  kw('create', T.Create),
  kw('destroy', T.Destroy, S.ID),
  kw('loop', T.Loop, S.LINE),
  kw('rect', T.Rect, S.LINE),
  kw('opt', T.Opt, S.LINE),
  kw('alt', T.Alt, S.LINE),
  kw('else', T.Else, S.LINE),
  kw('par', T.Par, S.LINE),
  kw('par_over', T.ParOver, S.LINE),
  kw('and', T.And, S.LINE),
  kw('critical', T.Critical, S.LINE),
  kw('option', T.Option, S.LINE),
  kw('break', T.Break, S.LINE),
  kw('end', T.End),
  kw('left of', T.LeftOf),
  kw('right of', T.RightOf),
  kw('links', T.Links, -1, B.Menu),
  kw('link', T.Link, -1, B.Menu),
  kw('properties', T.Properties, -1, B.Menu),
  kw('details', T.Details, -1, B.Menu),
  kw('over', T.Over),
  kw('note', T.Note),
  kw('activate', T.Activate, S.ID),
  kw('deactivate', T.Deactivate, S.ID),
];

/** The keywords after `title`/`accTitle`/`accDescr` in rule order. */
const LATE_KEYWORDS: readonly Keyword[] = [
  kw('sequencediagram', T.SD),
  kw('autonumber', T.Autonumber),
  kw('off', T.Off),
];

/** The arrow literals, in rule order (jison rules 61–86). `x` matches either case. */
const ARROWS: readonly (readonly [string, number])[] = [
  ['->>', T.SolidArrow],
  ['<<->>', T.BidirectionalSolidArrow],
  ['-->>', T.DottedArrow],
  ['<<-->>', T.BidirectionalDottedArrow],
  ['->', T.SolidOpenArrow],
  ['-->', T.DottedOpenArrow],
  ['-x', T.SolidCross],
  ['--x', T.DottedCross],
  ['-)', T.SolidPoint],
  ['--)', T.DottedPoint],
  ['--|\\', T.SolidArrowTopDotted],
  ['--|/', T.SolidArrowBottomDotted],
  ['--\\\\', T.StickArrowTopDotted],
  ['--//', T.StickArrowBottomDotted],
  ['/|--', T.SolidArrowTopReverseDotted],
  ['\\|--', T.SolidArrowBottomReverseDotted],
  ['//--', T.StickArrowTopReverseDotted],
  ['\\\\--', T.StickArrowBottomReverseDotted],
  ['-|\\', T.SolidArrowTop],
  ['-|/', T.SolidArrowBottom],
  ['-\\\\', T.StickArrowTop],
  ['-//', T.StickArrowBottom],
  ['/|-', T.SolidArrowTopReverse],
  ['\\|-', T.SolidArrowBottomReverse],
  ['//-', T.StickArrowTopReverse],
  ['\\\\-', T.StickArrowBottomReverse],
];

/** First characters of {@link ARROWS}. */
const isArrowStart = (c: number) => c === DASH || c === LT || c === SLASH || c === BACKSLASH;

/** Not in the generic ACTOR rule's first class `[^/\\+()<\->:\n,;]`. */
const isActorStop = (c: number) =>
  c === SLASH || c === BACKSLASH || c === LPAREN || c === RPAREN || isActorTailStop(c);

/** Not in the generic ACTOR rule's repeated class `[^+<\->:\n,;]`. */
const isActorTailStop = (c: number) =>
  c === PLUS ||
  c === LT ||
  c === DASH ||
  c === GT ||
  c === COLON ||
  c === LF ||
  c === COMMA ||
  c === SEMI;

/** Not in the ID-state class `[^<>:\n,;@]`. */
const isIdStop = (c: number) =>
  c === LT || c === GT || c === COLON || c === LF || c === COMMA || c === SEMI || c === AT;

/** Not in `[^#\n;]` (TXT, `restOfLine`, `title`). */
const isLineStop = (c: number) => c === HASH || c === LF || c === SEMI;

/** Not in the menu keywords' lookahead class `[^/\\+()<>:\n,;\s-]`. */
const isMenuStop = (c: number) =>
  Number.isNaN(c) ||
  isSpace(c) ||
  c === SLASH ||
  c === BACKSLASH ||
  c === PLUS ||
  c === LPAREN ||
  c === RPAREN ||
  c === LT ||
  c === GT ||
  c === COLON ||
  c === COMMA ||
  c === SEMI ||
  c === DASH;

/** A blank of `((?!\n)\s)`. */
const isLineBlank = (c: number) => c !== LF && isSpace(c);

const LOWER_X = 0x78;
const PLUS = 0x2b;
const SPACE = 0x20;
const TAB = 0x09;

/**
 * The text the lexer reads, of the same length as the view's text: v12 turned every CRLF and
 * CR into LF before lexing, so a CRLF reads as two LFs (every rule treats a run of line breaks
 * as one, except the single `\s` after `title`, which the lexer steps over as a pair) and a
 * lone CR as LF; each `#name;` entity is `ﬂ`, the name and `¶`, so no rule takes its `#` or `;`
 * (v12's placeholders).
 */
function lexerText(text: string): string {
  let out = text.includes('\r')
    ? text.replace(/\r\n?/g, (m) => (m.length === 2 ? '\n\n' : '\n'))
    : text;
  if (out.includes('#')) out = out.replace(/#(\w+);/g, (_, name: string) => `ﬂ${name}¶`);
  return out;
}

/** How v12's lexer read its text (see `StateLexerOptions`). */
const OPTIONS: StateLexerOptions = { charsPerToken: 4, crlf: 'keep', dropSpace: false };

/**
 * Lex the sequence body `src[from…]`. `view` comes from {@link sourceView}. With a `probe`, the
 * start condition at the probe's offset is recorded as its mode.
 */
export function lex(src: string, from: number, view: SourceView, probe?: Probe): TokenStream {
  return new SequenceLexer(src, from, view, OPTIONS).run(probe);
}

/**
 * One lex. Offsets are into {@link text}, v12's text; {@link emit} maps them to the source.
 * Each start condition is a method named after it.
 */
class SequenceLexer extends StateLexer {
  protected override prepare(text: string): string {
    return lexerText(text);
  }

  run(probe?: Probe): TokenStream {
    const { n } = this;
    this.trim();
    // Two loops, so a plain lex does no probe work per step.
    if (probe === undefined) while (this.p < n) this.next();
    else {
      while (this.p < n) {
        const before = this.p;
        const mode = S_NAMES[this.state] ?? '';
        this.next();
        probe.lexed(this.source(before), this.source(this.p), mode);
      }
      probe.lexed(this.src.length, this.src.length, S_NAMES[this.state] ?? '');
    }
    // At the end jison tries the rules once more on the empty input.
    const kind = this.endKind();
    if (kind !== -1) this.emit(kind, this.len, this.len);
    this.trivia(this.src.length + 1);
    return this.w.finish(this.src);
  }

  /** One step: the rule that matches at {@link p}, or an Error token where none does. */
  private next(): void {
    if (!this.step(this.text.charCodeAt(this.p))) {
      // No rule matches (jison throws): an Error token, then the initial state again.
      const c = this.text.charCodeAt(this.p);
      this.emit(Kind.Error, this.p, c === LF ? this.p : codePointEnd(this.text, this.p));
      this.stack.length = 0;
      this.state = S.INITIAL;
    }
  }

  /** The token a rule matching the empty input at the end gives in the current state. */
  private endKind(): number {
    switch (this.state) {
      case S.INITIAL:
        return T.Eof;
      case S.ALIAS:
        return T.AliasEnd;
      case S.LINE:
        return T.RestOfLine;
      case S.acc_title:
        return T.AccTitleValue;
      case S.acc_descr:
        return T.AccDescrValue;
      case S.acc_descr_multiline:
        return T.AccDescrMultilineValue;
      default:
        return -1;
    }
  }

  // --- Offsets and output -------------------------------------------------------------------

  protected override emit(kind: number, s: number, end: number, next: number = end): true {
    super.emit(kind, s, end, next);
    return true;
  }

  /** Write `text[s, e)` trimmed (jison's `yytext.trim()`), and move past it. */
  private trimmed(kind: number, s: number, e: number): true {
    let a = s;
    let b = e;
    while (a < b && isSpace(this.text.charCodeAt(a))) a++;
    while (b > a && isSpace(this.text.charCodeAt(b - 1))) b--;
    return this.emit(kind, a, b, e);
  }

  // --- Scans --------------------------------------------------------------------------------

  /** The end of the run of `[^#\n;]` from `q`. */
  private lineRun(q: number): number {
    let j = q;
    while (j < this.n && !isLineStop(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** `as` followed by `\s`, at `q` (the alias lookahead `\s+as\s`, after its blanks). */
  private asAt(q: number): boolean {
    return this.literal('as', q) && isSpace(this.text.charCodeAt(q + 2));
  }

  // --- States -------------------------------------------------------------------------------

  protected step(c: number): boolean {
    switch (this.state) {
      case S.INITIAL:
        return this.initial(c);
      case S.ID:
        return this.id(c);
      case S.ALIAS:
        return this.alias(c);
      case S.LINE:
        return this.line(c);
      case S.CONFIG:
        return this.config(c);
      case S.acc_title:
      case S.acc_descr:
        return this.accValue();
      default:
        return this.accDescrMultiline(c);
    }
  }

  private initial(c: number): boolean {
    const { text, p } = this;
    // [\n]+ and \s+
    if (c === LF) {
      let e = p + 1;
      while (text.charCodeAt(e) === LF) e++;
      return this.emit(Kind.Newline, p, e);
    }
    if (isSpace(c)) {
      this.p = this.spaces(p);
      return true;
    }
    // Comments: `#[^\n]*`, `%(?!\{)[^\n]*`, `[^\}]%%[^\n]*`.
    if (
      c === HASH ||
      (c === PERCENT && text.charCodeAt(p + 1) !== LBRACE) ||
      (c !== RBRACE && text.charCodeAt(p + 1) === PERCENT && text.charCodeAt(p + 2) === PERCENT)
    ) {
      return this.emit(Kind.Comment, p, this.lineEnd(p));
    }
    if (this.num(c)) return true;
    if (this.keyword(KEYWORDS)) return true;
    if (this.titles(c)) return true;
    if (this.acc(c)) return true;
    if (this.keyword(LATE_KEYWORDS)) return true;
    if (c === COMMA) return this.emit(T.Comma, p, p + 1);
    if (c === SEMI) return this.emit(T.Semi, p, p + 1);
    if (this.actor(c)) return true;
    if (isArrowStart(c) && this.arrow()) return true;
    if (c === COLON) return this.emit(T.Txt, p, this.lineRun(p + 1));
    if (c === PLUS) return this.emit(T.Plus, p, p + 1);
    if (c === DASH) return this.emit(T.Minus, p, p + 1);
    if (c === LPAREN && text.charCodeAt(p + 1) === RPAREN) return this.emit(T.Parens, p, p + 2);
    // `.`: one code unit (line terminators were taken by `\s+`).
    return this.emit(T.Invalid, p, p + 1);
  }

  /** `([0-9]+(\.[0-9]{1,2})?|\.[0-9]{1,2})(?=[ \n]+)` */
  private num(c: number): boolean {
    const { text, p } = this;
    let e = p;
    while (isDigit(text.charCodeAt(e))) e++;
    if (e === p && c !== DOT) return false;
    if (text.charCodeAt(e) === DOT && isDigit(text.charCodeAt(e + 1))) {
      e += 2;
      if (isDigit(text.charCodeAt(e))) e++;
    } else if (e === p) return false;
    const d = text.charCodeAt(e);
    if (d !== SPACE && d !== LF) return false;
    return this.emit(T.Num, p, e);
  }

  private keyword(list: readonly Keyword[]): boolean {
    const { text, p } = this;
    const c = lowerCode(text.charCodeAt(p));
    for (const k of list) {
      if (k.word.charCodeAt(0) !== c || !this.literal(k.word, p)) continue;
      const e = p + k.word.length;
      if (k.boundary === B.Word) {
        if (isWord(text.charCodeAt(e))) continue;
      } else {
        let j = e;
        while (text.charCodeAt(j) === SPACE || text.charCodeAt(j) === TAB) j++;
        if (j === e || isMenuStop(text.charCodeAt(j))) continue;
      }
      this.emit(k.kind, p, e);
      if (k.begin !== -1) this.pushState(k.begin);
      return true;
    }
    return false;
  }

  /** `title\s[^#\n;]+` and `title:\s[^#\n;]+`. */
  private titles(c: number): boolean {
    if (lowerCode(c) !== 116 || !this.literal('title', this.p)) return false;
    const q = this.p + 5;
    const colon = this.text.charCodeAt(q) === COLON ? 1 : 0;
    if (!isSpace(this.text.charCodeAt(q + colon))) return false;
    // The one `\s` is a whole CRLF (v12 saw one LF there).
    const after = q + colon + (this.raw.charCodeAt(q + colon) === CR ? 2 : 1);
    const e = this.lineRun(after);
    if (e === after) return false;
    return this.emit(colon ? T.LegacyTitle : T.Title, this.p, e);
  }

  /** `accTitle\s*:\s*`, `accDescr\s*:\s*` and `accDescr\s*\{\s*`. */
  private acc(c: number): boolean {
    const { text, p } = this;
    if (lowerCode(c) !== 97) return false;
    const title = this.literal('acctitle', p);
    if (!title && !this.literal('accdescr', p)) return false;
    const j = this.spaces(p + 8);
    const d = text.charCodeAt(j);
    if (d === COLON) {
      this.emit(title ? T.AccTitle : T.AccDescr, p, this.spaces(j + 1));
      this.pushState(title ? S.acc_title : S.acc_descr);
      return true;
    }
    if (title || d !== LBRACE) return false;
    this.emit(T.AccDescrMultiline, p, j + 1, this.spaces(j + 1));
    this.pushState(S.acc_descr_multiline);
    return true;
  }

  /**
   * The generic ACTOR rule, trimmed: a run of the first class, then repeats of
   * `(?!arrow prefix)-*` and a run of the second class. Greedy without backtracking: each
   * repeat stops at a character neither class takes, so no shorter split matches more.
   */
  private actor(c: number): boolean {
    const { text, p } = this;
    if (isActorStop(c)) return false;
    let q = p + 1;
    while (q < this.n && !isActorStop(text.charCodeAt(q))) q++;
    for (;;) {
      if (this.arrowPrefix(q)) break;
      let j = q;
      while (text.charCodeAt(j) === DASH) j++;
      if (j >= this.n || isActorTailStop(text.charCodeAt(j))) break;
      while (j < this.n && !isActorTailStop(text.charCodeAt(j))) j++;
      q = j;
    }
    return this.trimmed(T.Actor, p, q);
  }

  /**
   * The ACTOR rule's negative lookahead: `-x`, `--x`, `-)`, `--)`, `-|\`, `-\`, `-/`, `-//`,
   * `-|/`, `/|-`, `\|-`, `//-`, `\\-`, `--|\`, `--` or `()` at `q`.
   */
  private arrowPrefix(q: number): boolean {
    const t = this.text;
    const c = t.charCodeAt(q);
    const d = t.charCodeAt(q + 1);
    if (c === DASH) {
      if (lowerCode(d) === LOWER_X || d === RPAREN || d === BACKSLASH || d === SLASH || d === DASH)
        return true;
      const e = t.charCodeAt(q + 2);
      return d === PIPE && (e === BACKSLASH || e === SLASH);
    }
    if (c === SLASH || c === BACKSLASH) {
      return (d === PIPE || d === c) && t.charCodeAt(q + 2) === DASH;
    }
    return c === LPAREN && d === RPAREN;
  }

  private arrow(): boolean {
    for (const [word, kind] of ARROWS) {
      if (this.literal(word, this.p)) return this.emit(kind, this.p, this.p + word.length);
    }
    return false;
  }

  private id(c: number): boolean {
    const { text, p } = this;
    if (isLineBlank(c)) {
      let e = p + 1;
      while (isLineBlank(text.charCodeAt(e))) e++;
      this.p = e;
      return true;
    }
    if (c === HASH) return this.emit(Kind.Comment, p, this.lineEnd(p));
    if (c === AT && text.charCodeAt(p + 1) === LBRACE) {
      this.emit(T.ConfigStart, p, p + 2);
      this.pushState(S.CONFIG);
      return true;
    }
    // `[^<>:\n,;@\s]+` followed by `\s*@\{` (stays in ID) or `\s+as\s` (to ALIAS).
    let e = p;
    while (e < this.n && !isIdStop(text.charCodeAt(e)) && !isSpace(text.charCodeAt(e))) e++;
    if (e > p) {
      const j = this.spaces(e);
      if (text.charCodeAt(j) === AT && text.charCodeAt(j + 1) === LBRACE) {
        return this.emit(T.Actor, p, e);
      }
      if (j > e && this.asAt(j)) {
        this.emit(T.Actor, p, e);
        this.pushState(S.ALIAS);
        return true;
      }
    }
    return this.idRun(c, e);
  }

  /**
   * The ID rules after the lookahead ones, from the end `from` of the run without blanks:
   * `[^<>:\n,;@]+(?=\s*[\n;#]|$)` (the whole run when a line end or `;` follows it, else the
   * run up to its last `#`, where the lookahead backtracks to), then `[^<>:\n,;@]*<[^\n]*` and
   * `[^\n]+` (trimmed), both INVALID.
   */
  private idRun(c: number, from: number): boolean {
    const { text, p } = this;
    let e = from;
    while (e < this.n && !isIdStop(text.charCodeAt(e))) e++;
    const d = text.charCodeAt(e);
    if (e > p) {
      let end = d === LF || d === SEMI || e >= this.n ? e : -1;
      for (let h = e - 1; end === -1 && h > p; h--) if (text.charCodeAt(h) === HASH) end = h;
      if (end !== -1) {
        this.trimmed(T.Actor, p, end);
        this.popState();
        return true;
      }
    }
    // `[^<>:\n,;@]*<[^\n]*` and `[^\n]+` (trimmed): INVALID.
    if (d === LT) {
      this.emit(T.Invalid, p, this.lineEnd(e));
      this.popState();
      return true;
    }
    if (c === LF) return false;
    this.trimmed(T.Invalid, p, this.lineEnd(p));
    this.popState();
    return true;
  }

  private alias(c: number): boolean {
    const { p } = this;
    if (isLineBlank(c)) {
      let e = p + 1;
      while (isLineBlank(this.text.charCodeAt(e))) e++;
      this.p = e;
      return true;
    }
    if (c === HASH) return this.emit(Kind.Comment, p, this.lineEnd(p));
    this.popState();
    this.popState();
    if (this.literal('as', p) && !isWord(this.text.charCodeAt(p + 2))) {
      this.emit(T.As, p, p + 2);
      this.pushState(S.LINE);
      return true;
    }
    return this.emit(T.AliasEnd, p, p);
  }

  private line(c: number): boolean {
    const { p } = this;
    if (isLineBlank(c)) {
      let e = p + 1;
      while (isLineBlank(this.text.charCodeAt(e))) e++;
      this.p = e;
      return true;
    }
    if (c === HASH) return this.emit(Kind.Comment, p, this.lineEnd(p));
    this.popState();
    return this.emit(T.RestOfLine, p, this.lineRun(p));
  }

  private config(c: number): boolean {
    const { text, p } = this;
    if (c !== RBRACE) {
      const e = text.indexOf('}', p);
      return this.emit(T.ConfigContent, p, e === -1 ? this.n : e);
    }
    this.emit(T.ConfigEnd, p, p + 1);
    this.popState();
    // `\}(?=\s+as\s)`: on to ALIAS; else out of ID too.
    const j = this.spaces(p + 1);
    if (j > p + 1 && this.asAt(j)) this.pushState(S.ALIAS);
    else this.popState();
    return true;
  }

  /** `[^\n]*` (the acc title and the one-line acc description). */
  private accValue(): boolean {
    const kind = this.state === S.acc_title ? T.AccTitleValue : T.AccDescrValue;
    this.popState();
    return this.emit(kind, this.p, this.lineEnd(this.p));
  }

  private accDescrMultiline(c: number): boolean {
    const { text, p } = this;
    if (c === RBRACE) {
      this.popState();
      return this.emit(T.AccDescrMultilineEnd, p, p + 1);
    }
    const e = text.indexOf('}', p);
    return this.emit(T.AccDescrMultilineValue, p, e === -1 ? this.n : e);
  }
}
