/**
 * Hand-built `SequenceModel` fixtures for the layout specs, written as v12 would parse the
 * sequence source above each one. They stand in for parser-produced fixtures until #139 lands.
 */
import type {
  ArrowKind,
  FragmentKind,
  FragmentSection,
  ParticipantKind,
  SequenceMessage,
  SequenceModel,
  SequenceNote,
  SequenceParticipant,
  SequenceStatement,
} from '../model.js';

let ordinal = 0;

export const p = (
  id: string,
  kind: ParticipantKind = 'participant',
  extra: Partial<SequenceParticipant> = {}
): SequenceParticipant => ({ id, ast: `p:${id}`, label: id, kind, ...extra });

export const msg = (
  from: string,
  to: string,
  text: string,
  arrow: ArrowKind = 'solid',
  extra: Partial<SequenceMessage> = {}
): SequenceMessage => ({
  kind: 'message',
  ast: `m:${from}>${to}#${ordinal++}`,
  from,
  to,
  text,
  arrow,
  ...extra,
});

export const note = (
  placement: SequenceNote['placement'],
  participants: SequenceNote['participants'],
  text: string,
  wrap?: boolean
): SequenceNote => ({
  kind: 'note',
  ast: `note:${ordinal++}`,
  placement,
  participants,
  text,
  ...(wrap !== undefined ? { wrap } : {}),
});

export const act = (participant: string, active: boolean): SequenceStatement => ({
  kind: 'activation',
  ast: `st:${ordinal++}`,
  participant,
  active,
});

export const frag = (
  fragment: FragmentKind,
  ...sections: [string, SequenceStatement[]][]
): SequenceStatement => ({
  kind: 'fragment',
  ast: `f:${fragment}#${ordinal++}`,
  fragment,
  sections: sections.map(
    ([label, statements], i): FragmentSection => ({
      ...(i > 0 ? { ast: `st:${ordinal++}` } : {}),
      label,
      statements,
    })
  ),
});

export const rect = (color: string, statements: SequenceStatement[]): SequenceStatement => ({
  kind: 'rect',
  ast: `st:${ordinal++}`,
  color,
  statements,
});

export const model = (
  participants: SequenceParticipant[],
  statements: SequenceStatement[],
  extra: Partial<SequenceModel> = {}
): SequenceModel => ({
  participants,
  boxes: [],
  statements,
  accTitle: '',
  accDescr: '',
  warnings: [],
  ...extra,
});

/** One message: `A-\>\>B: Hello`. */
export const hello = model([p('A'), p('B')], [msg('A', 'B', 'Hello')]);

const ARROWS: ArrowKind[] = [
  'solid',
  'dotted',
  'solid_cross',
  'dotted_cross',
  'solid_open',
  'dotted_open',
  'solid_point',
  'dotted_point',
  'bidirectional_solid',
  'bidirectional_dotted',
  'solid_top',
  'solid_bottom',
  'stick_top',
  'stick_bottom',
  'solid_arrow_top_reverse',
  'solid_arrow_bottom_reverse',
  'stick_arrow_top_reverse',
  'stick_arrow_bottom_reverse',
  'solid_top_dotted',
  'solid_bottom_dotted',
  'stick_top_dotted',
  'stick_bottom_dotted',
  'solid_arrow_top_reverse_dotted',
  'solid_arrow_bottom_reverse_dotted',
  'stick_arrow_top_reverse_dotted',
  'stick_arrow_bottom_reverse_dotted',
];

export const FIXTURES: Readonly<Record<string, SequenceModel>> = {
  hello,

  /** Solid, dotted and async messages, a self message, notes in each placement, an empty text. */
  messagesAndNotes: model(
    [p('Alice', 'participant', { label: 'Alice Wonderland' }), p('John'), p('Carol')],
    [
      msg('Alice', 'John', 'Hello John, how are you?'),
      msg('John', 'Alice', 'Great!', 'dotted'),
      msg('Alice', 'John', 'See you later!', 'solid_point'),
      msg('John', 'John', 'Fight against hypochondria'),
      note('right', ['John'], 'Rational thoughts <br/>prevail!'),
      note('left', ['Alice'], 'A note on the left'),
      note('over', ['Carol'], 'Over Carol'),
      note('over', ['Alice', 'John'], 'A typical interaction spanning both'),
      msg('Alice', 'Carol', 'A message across a column'),
      msg('Carol', 'Alice', ''),
    ]
  ),

  /** One message of each arrow kind, both ways. */
  arrows: model(
    [p('A'), p('B')],
    ARROWS.map((arrow, i) => (i % 2 ? msg('B', 'A', arrow, arrow) : msg('A', 'B', arrow, arrow)))
  ),

  /** activate, `+`/`-`, stacked activations, central connections. */
  activations: model(
    [p('A'), p('B'), p('C')],
    [
      act('A', true),
      msg('A', 'B', 'start', 'solid', { activation: 'activate' }),
      msg('B', 'B', 'self', 'solid', { activation: 'activate' }),
      msg('B', 'C', 'deeper', 'solid', { activation: 'activate' }),
      act('C', true),
      act('C', true),
      msg('C', 'B', 'done', 'dotted', { activation: 'deactivate' }),
      act('C', false),
      act('C', false),
      msg('B', 'A', 'back', 'dotted', { activation: 'deactivate' }),
      act('B', false),
      act('A', false),
      act('A', false),
      msg('A', 'B', 'central to', 'solid', { central: 'to' }),
      msg('A', 'C', 'central from', 'solid', { central: 'from' }),
      msg('C', 'A', 'central both', 'bidirectional_solid', { central: 'both' }),
      act('B', false),
      act('C', false),
      act('A', false),
    ]
  ),

  /** loop, alt/else, opt, par/and, critical/option, break, par_over, rect, nested and empty. */
  fragments: model(
    [p('A'), p('B'), p('C')],
    [
      frag('loop', [
        'Every minute',
        [
          msg('A', 'B', 'ping'),
          frag(
            'alt',
            ['is ok', [msg('B', 'A', 'pong', 'dotted')]],
            [
              'is sick',
              [
                msg('B', 'A', 'cough', 'dotted_cross'),
                frag('opt', ['', [note('over', ['B'], 'rest')]]),
              ],
            ],
            ['empty else', []]
          ),
        ],
      ]),
      frag(
        'par',
        ['Alice to Bob', [msg('A', 'B', 'one')]],
        ['Alice to Carol', [msg('A', 'C', 'two'), msg('C', 'C', 'self in par')]],
        ['', []]
      ),
      frag(
        'critical',
        ['Establish a connection to the DB', [msg('B', 'C', 'connect')]],
        ['Network timeout', [msg('B', 'B', 'Log error')]]
      ),
      frag('break', ['when the booking process fails', [msg('C', 'A', 'show failure')]]),
      frag('loop', ['', []]),
      rect('rgb(191, 223, 255)', [
        note('right', ['A'], 'inside a rect'),
        frag('par_over', ['over', [msg('A', 'C', 'through the rect')]]),
      ]),
      rect('', []),
    ]
  ),

  /** box groups, typed participants, create and destroy. */
  lifecycle: model(
    [
      p('U', 'actor', { box: 0 }),
      p('W', 'boundary', { box: 0, label: 'Web front end' }),
      p('S', 'control', { box: 1 }),
      p('E', 'entity', { box: 1 }),
      p('D', 'database'),
      p('L', 'collections', { createdBy: 'm:S>L#create' }),
      p('Q', 'queue', { destroyedBy: 'm:Q>S#destroy' }),
      p('K', 'actor', { createdBy: 'm:U>K#create', destroyedBy: 'm:K>U#destroy' }),
    ],
    [
      msg('U', 'W', 'open'),
      msg('W', 'S', 'request'),
      msg('S', 'E', 'load'),
      msg('E', 'D', 'query'),
      { ...msg('S', 'L', 'create log'), ast: 'm:S>L#create' },
      note('over', ['L'], 'just created'),
      msg('S', 'Q', 'enqueue'),
      { ...msg('Q', 'S', 'drain'), ast: 'm:Q>S#destroy' },
      { ...msg('U', 'K', 'hire'), ast: 'm:U>K#create' },
      note('right', ['K'], 'new hire'),
      { ...msg('K', 'U', 'quit'), ast: 'm:K>U#destroy' },
      msg('D', 'U', 'report'),
    ],
    {
      boxes: [
        {
          ast: 'box:0',
          label: 'Front end of the whole system',
          color: 'Aqua',
          participants: ['U', 'W'],
        },
        { ast: 'box:1', label: '', participants: ['S', 'E'] },
      ],
    }
  ),

  /** autonumber, wrap, unused participants, a title. */
  numbersAndWrap: model(
    [
      p('A', 'participant', { wrap: true, label: 'A participant with a long name' }),
      p('B'),
      p('Z'),
    ],
    [
      { kind: 'autonumber', ast: 'st:a1', start: 10, step: 5, visible: true },
      msg('A', 'B', 'A long message that needs wrapping to stay readable in the diagram', 'solid', {
        wrap: true,
      }),
      msg('B', 'A', 'A reply<br>on two lines', 'dotted'),
      note('over', ['A', 'B'], 'A long note that wraps over two participants', true),
      { kind: 'autonumber', ast: 'st:a2', visible: false },
      msg('A', 'A', 'not numbered'),
      msg('B', 'A', 'reverse', 'solid_arrow_top_reverse'),
    ],
    { title: 'Numbers and wrapping' }
  ),

  /** Nothing to draw. */
  empty: model([], []),
};
