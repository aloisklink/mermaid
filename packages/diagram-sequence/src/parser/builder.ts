/**
 * The sequence model builder: v12's `SequenceDB.apply` (DB:557–718) as plain data in source
 * order. Each method is one `apply` case, with v12's checks; a check that threw in v12 is an
 * error diagnostic here and the parse goes on (R-PARSE-4).
 *
 * v12 facts it keeps:
 * - participants are kept in first-mention order; a mention never changes a participant, a
 *   declaration with a description (`as …`, `@{ alias }`) rewrites it in place (kind, label and
 *   wrap), one without keeps it as it is, except that it may move it into the open box;
 * - every box member line adds the id to the box's member list, so a member declared twice is
 *   listed twice;
 * - `create` must name a new id, and the next message must go to it; after `destroy` the next
 *   message must come from or go to it;
 * - a deactivation needs an activation open on that participant, counted over the whole
 *   diagram so far (blocks do not scope it);
 * - `activate`, `deactivate` and `destroy` do not add a participant (v12 adds one only for
 *   declarations and for message, note and menu statements).
 */
import { checkLimit } from '@mermaid-js/core/v13/limits/index.js';
import type { AstId, Diagnostic, Range } from '@mermaid-js/core/v13/parser-kit/index.js';
import type {
  FragmentKind,
  FragmentSection,
  ParticipantKind,
  SequenceBox,
  SequenceFragment,
  SequenceMessage,
  SequenceModel,
  SequenceParticipant,
  SequenceRect,
  SequenceStatement,
} from '../model.js';
import type { BoxData, Wrapped } from './normalise.js';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Participant = Mutable<SequenceParticipant>;
type Box = Mutable<SequenceBox> & { participants: string[] };
type Section = Mutable<FragmentSection> & { statements: SequenceStatement[] };

export interface BuilderSink {
  error(code: string, message: string, range: Range): void;
  warn(code: string, message: string, range: Range): void;
  /** A redeclaration reset the menus merged into `id` so far (v12 wrote a new record). */
  menusReset?(id: string): void;
}

/** The caps a builder checks, one call per item added (D608); core's defaults when absent. */
export interface BuilderCaps {
  /** Participant cap (core `DEFAULT_LIMITS.maxNodes`). */
  maxNodes?: number | undefined;
  /** Message cap (core `DEFAULT_LIMITS.maxEdges`); notes do not count. */
  maxEdges?: number | undefined;
}

/** A participant statement's parts (pitfall 10: more than four parameters). */
export interface DeclareParts {
  id: string;
  /** AST id of the statement. */
  ast: AstId;
  range: Range;
  /** `participant` or `actor`; undefined for `create destroy …`. */
  kind?: ParticipantKind | undefined;
  /** The `as …` text. */
  description?: Wrapped | undefined;
  /** The `@{ … }` data's `type` and `alias`, already read. */
  dataType?: ParticipantKind | undefined;
  dataAlias?: string | undefined;
}

interface Pending {
  id: string;
  /** The statement's range, for the error. */
  range: Range;
}

export class SequenceBuilder {
  readonly participants = new Map<string, Participant>();
  readonly boxes: Box[] = [];
  /** The statement list being filled, innermost block last. */
  private readonly lists: SequenceStatement[][] = [[]];
  private currentBox: Box | undefined;
  private lastCreated: Pending | undefined;
  private lastDestroyed: Pending | undefined;
  /** Participants whose destroying message has passed. */
  private readonly gone = new Set<string>();
  /** Open activations per participant, over the whole diagram so far (v12 `activationCount`). */
  private readonly active = new Map<string, number>();
  /** Messages so far, blocks included, for the `maxEdges` cap. */
  private messages = 0;
  title: string | undefined;
  accTitle = '';
  accDescr = '';

  constructor(
    private readonly sink: BuilderSink,
    private readonly caps: BuilderCaps = {}
  ) {}

  private get list(): SequenceStatement[] {
    return this.lists[this.lists.length - 1] as SequenceStatement[];
  }

  // ---- participants (v12 addActor) -----------------------------------------------------

  /** A mention in a message, note or menu statement: adds the participant if it is new. */
  mention(id: string, ast: AstId, range: Range): void {
    this.add({ id, ast, range });
  }

  /** `participant …`, `actor …` (and the participant line of `create …`). */
  declare(parts: DeclareParts): void {
    this.add(parts);
  }

  /** `create participant …`: the id must be new, and the next message must go to it. */
  create(parts: DeclareParts): void {
    if (this.participants.has(parts.id)) {
      this.sink.error(
        'SEQUENCE_CREATE_EXISTING',
        `\`${parts.id}\` already exists, so it cannot be created here: give the created participant another id and use \`as\` for its label.`,
        parts.range
      );
    }
    this.lastCreated = { id: parts.id, range: parts.range };
    this.add(parts);
    const p = this.participants.get(parts.id);
    if (p) p.createAst = parts.ast;
  }

  /** `destroy A`: the next message must come from or go to it. */
  destroy(id: string, ast: AstId, range: Range): void {
    this.lastDestroyed = { id, range };
    const p = this.participants.get(id);
    if (p) p.destroyAst = ast;
    else this.pendingDestroyAst.set(id, ast);
  }

  private readonly pendingDestroyAst = new Map<string, AstId>();

  /** The description a declaration gives: its `as …`, or the `@{ alias }` in its place. */
  private description(parts: DeclareParts): Wrapped | undefined {
    const d = parts.description;
    if (parts.dataAlias === undefined || (d && d.text !== parts.id)) return d;
    return d?.wrap === undefined
      ? { text: parts.dataAlias }
      : { text: parts.dataAlias, wrap: d.wrap };
  }

  /** The box a participant ends up in (index), checking that it is in one box only. */
  private boxOf(old: Participant | undefined, parts: DeclareParts): number | undefined {
    const box = this.currentBox;
    const current = box ? this.boxes.indexOf(box) : undefined;
    if (!old) return current;
    if (box && old.box !== undefined && this.boxes[old.box] !== box) {
      this.sink.error(
        'SEQUENCE_BOX_CONFLICT',
        `\`${parts.id}\` is already in the box \`${this.boxes[old.box]?.label ?? ''}\`: a participant can be in one box only.`,
        parts.range
      );
    }
    return old.box ?? current;
  }

  private add(parts: DeclareParts): void {
    const { id } = parts;
    const kind = parts.dataType ?? parts.kind;
    let description = this.description(parts);
    const old = this.participants.get(id);
    const boxIndex = this.boxOf(old, parts);
    if (old) {
      // v12 moves a known participant into the open box even when nothing else changes.
      setBox(old, boxIndex);
      if (description === undefined) return;
    }
    // v12: no type (a mention, `create destroy …`) resets the description to the id.
    if (kind === undefined) description = undefined;
    const p: Participant = old ?? { id, ast: parts.ast, label: id, kind: 'participant' };
    // v12 wrote a new record: the menus merged so far are gone.
    delete p.links;
    delete p.properties;
    if (old) this.sink.menusReset?.(id);
    p.label = description?.text ?? id;
    p.kind = kind ?? 'participant';
    if (description?.wrap !== undefined) p.wrap = description.wrap;
    else delete p.wrap;
    setBox(p, boxIndex);
    if (!old) {
      const destroyAst = this.pendingDestroyAst.get(id);
      if (destroyAst !== undefined) p.destroyAst = destroyAst;
      this.participants.set(id, p);
      const { size } = this.participants;
      checkLimit(this.sink, 'maxNodes', size, this.caps.maxNodes, 'participants', parts.range);
    }
    this.currentBox?.participants.push(id);
  }

  /** Merge actor menu data into `id` (v12 `insertLinks`/`insertProperties`). */
  menu(
    id: string,
    data: { links?: Record<string, unknown>; properties?: Record<string, unknown> }
  ): void {
    const p = this.participants.get(id);
    if (!p) return;
    if (data.links) p.links = { ...p.links, ...data.links };
    if (data.properties) p.properties = { ...p.properties, ...data.properties };
  }

  // ---- boxes ---------------------------------------------------------------------------

  openBox(ast: AstId, data: BoxData): void {
    const box: Box = { ast, label: data.text ?? '', participants: [] };
    if (data.color !== 'transparent') box.color = data.color;
    if (data.wrap !== undefined) box.wrap = data.wrap;
    this.boxes.push(box);
    this.currentBox = box;
  }

  closeBox(): void {
    this.currentBox = undefined;
  }

  // ---- statements ----------------------------------------------------------------------

  /** A message (v12 `addMessage`, with its create/destroy checks). */
  message(m: Mutable<SequenceMessage>, range: Range): void {
    const created = this.lastCreated;
    const destroyed = this.lastDestroyed;
    let ends: string | undefined;
    // One diagnostic per mistake (pitfall 8): the pending check is dropped once it has failed.
    if (created) {
      this.lastCreated = undefined;
      if (m.to === created.id) {
        const p = this.participants.get(created.id);
        if (p) p.createdBy = m.ast;
      } else {
        this.sink.error(
          'SEQUENCE_CREATE_MESSAGE',
          `\`${created.id}\` is created here, so the next message must go to it.`,
          created.range
        );
      }
    } else if (destroyed) {
      this.lastDestroyed = undefined;
      if (m.to === destroyed.id || m.from === destroyed.id) {
        const p = this.participants.get(destroyed.id);
        if (p) p.destroyedBy = m.ast;
        ends = destroyed.id;
      } else {
        this.sink.error(
          'SEQUENCE_DESTROY_MESSAGE',
          `\`${destroyed.id}\` is destroyed here, so the next message must come from it or go to it.`,
          destroyed.range
        );
      }
    }
    if (this.gone.has(m.from) || this.gone.has(m.to)) this.afterDestroy(m, range);
    if (ends !== undefined) this.gone.add(ends);
    this.list.push(m);
    this.messages++;
    checkLimit(this.sink, 'maxEdges', this.messages, this.caps.maxEdges, 'messages', range);
  }

  private afterDestroy(m: SequenceMessage, range: Range): void {
    const id = this.gone.has(m.from) ? m.from : m.to;
    this.sink.warn(
      'SEQUENCE_AFTER_DESTROY',
      `\`${id}\` was destroyed by an earlier message: this message is drawn below its end.`,
      range
    );
  }

  /** An activation change on `id` (`activate`, `+`); true when it is allowed. */
  activate(id: string): void {
    this.active.set(id, (this.active.get(id) ?? 0) + 1);
  }

  /** A deactivation (`deactivate`, `-`): an error when `id` has no open activation. */
  deactivate(id: string, range: Range): boolean {
    const n = this.active.get(id) ?? 0;
    if (n < 1) {
      this.sink.error(
        'SEQUENCE_INACTIVE',
        `\`${id}\` is not active here, so it cannot be deactivated: activate it first, with \`activate ${id}\` or a \`+\` message.`,
        range
      );
      return false;
    }
    this.active.set(id, n - 1);
    return true;
  }

  statement(s: SequenceStatement): void {
    this.list.push(s);
  }

  // ---- blocks --------------------------------------------------------------------------

  /** Open a fragment; its first section is filled until {@link section} or {@link close}. */
  openFragment(ast: AstId, fragment: FragmentKind, label: Wrapped): SequenceFragment {
    const first: Section = { label: label.text, statements: [] };
    if (label.wrap !== undefined) first.wrap = label.wrap;
    const f: SequenceFragment = { kind: 'fragment', ast, fragment, sections: [first] };
    this.list.push(f);
    this.lists.push(first.statements);
    return f;
  }

  /** An `else`/`and`/`option` line of the open fragment `f`. */
  section(f: SequenceFragment, ast: AstId, label: Wrapped): void {
    const s: Section = { ast, label: label.text, statements: [] };
    if (label.wrap !== undefined) s.wrap = label.wrap;
    (f.sections as Section[]).push(s);
    this.lists.pop();
    this.lists.push(s.statements);
  }

  openRect(ast: AstId, color: string): void {
    const r: SequenceRect = { kind: 'rect', ast, color, statements: [] };
    this.list.push(r);
    this.lists.push(r.statements as SequenceStatement[]);
  }

  /** Close the innermost fragment or rect. */
  close(): void {
    if (this.lists.length > 1) this.lists.pop();
  }

  model(warnings: Diagnostic[]): SequenceModel {
    const out: Mutable<SequenceModel> = {
      participants: [...this.participants.values()],
      boxes: this.boxes,
      statements: this.lists[0] ?? [],
      accTitle: this.accTitle,
      accDescr: this.accDescr,
      warnings,
    };
    if (this.title !== undefined) out.title = this.title;
    return out;
  }
}

function setBox(p: Participant, box: number | undefined): void {
  if (box === undefined) delete p.box;
  else p.box = box;
}
