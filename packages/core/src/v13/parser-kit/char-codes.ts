/**
 * UTF-16 code units by name, for comparing `charCodeAt` results. Each is its own `const`, so
 * bundlers inline the number at every use.
 */
export const NUL = 0x00;
export const TAB = 0x09;
export const LF = 0x0a;
export const CR = 0x0d;
export const SPACE = 0x20;
export const DQUOTE = 0x22;
export const HASH = 0x23;
export const PERCENT = 0x25;
export const AMP = 0x26;
export const APOSTROPHE = 0x27;
export const LPAREN = 0x28;
export const RPAREN = 0x29;
export const STAR = 0x2a;
export const COMMA = 0x2c;
export const DASH = 0x2d;
export const DOT = 0x2e;
export const SLASH = 0x2f;
export const DIGIT_0 = 0x30;
export const DIGIT_9 = 0x39;
export const COLON = 0x3a;
export const SEMI = 0x3b;
export const LT = 0x3c;
export const EQUALS = 0x3d;
export const GT = 0x3e;
export const QUESTION = 0x3f;
export const AT = 0x40;
export const LBRACKET = 0x5b;
export const BACKSLASH = 0x5c;
export const RBRACKET = 0x5d;
export const CARET = 0x5e;
export const UNDERSCORE = 0x5f;
export const BACKTICK = 0x60;
export const LOWER_A = 0x61;
export const LOWER_C = 0x63;
export const LOWER_D = 0x64;
export const LOWER_E = 0x65;
export const LOWER_F = 0x66;
export const LOWER_G = 0x67;
export const LOWER_H = 0x68;
export const LOWER_I = 0x69;
export const LOWER_L = 0x6c;
export const LOWER_O = 0x6f;
export const LOWER_S = 0x73;
export const LOWER_V = 0x76;
export const LOWER_X = 0x78;
export const LBRACE = 0x7b;
export const PIPE = 0x7c;
export const RBRACE = 0x7d;
export const TILDE = 0x7e;
/** The last ASCII code unit (DEL). */
export const ASCII_MAX = 0x7f;
/** NEXT LINE (NEL), the one C1 control that YAML treats as printable. */
export const NEL = 0x85;
/** The last C1 control. */
export const C1_LAST = 0x9f;
/** The last Latin-1 code unit. */
export const LATIN1_MAX = 0xff;
export const HIGH_SURROGATE_FIRST = 0xd800;
export const HIGH_SURROGATE_LAST = 0xdbff;
export const LOW_SURROGATE_FIRST = 0xdc00;
export const LOW_SURROGATE_LAST = 0xdfff;
/** U+FFFE, a byte-swapped byte order mark and a non-character. */
export const REVERSED_BOM = 0xfffe;
/** U+FFFF, the last BMP code unit and a non-character. */
export const BMP_LAST = 0xffff;
