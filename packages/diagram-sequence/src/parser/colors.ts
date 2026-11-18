/**
 * The CSS named colours (CSS Color 4, `grey` spellings aside), for the box line's colour test.
 * Kept here rather than imported from `@mermaid-js/core/theme`: that import made the bundler
 * split the theme modules out of the entry into a chunk shared with the sequence plugin, one
 * more file on every SVG render (#145 review). `colors.spec.ts` checks it against core's `parseColor`. The CSS list is frozen.
 */
const NAMES = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue ' +
    'blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk ' +
    'crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkkhaki darkmagenta ' +
    'darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue ' +
    'darkslategray darkturquoise darkviolet deeppink deepskyblue dimgray dodgerblue firebrick ' +
    'floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow ' +
    'honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen ' +
    'lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen ' +
    'lightpink lightsalmon lightseagreen lightskyblue lightslategray lightsteelblue lightyellow ' +
    'lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple ' +
    'mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred ' +
    'midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange ' +
    'orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff ' +
    'peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon ' +
    'sandybrown seagreen seashell sienna silver skyblue slateblue slategray snow springgreen ' +
    'tan teal thistle turquoise violet wheat white whitesmoke yellow yellowgreen'
  ).split(' ')
);

/** The names, for the spec. */
export const NAMED_COLORS: ReadonlySet<string> = NAMES;

/** Whether `word` (lower case) is a CSS named colour; `grey` spellings count as `gray`. */
export function isNamedColor(word: string): boolean {
  return NAMES.has(word.replace(/grey/g, 'gray'));
}
