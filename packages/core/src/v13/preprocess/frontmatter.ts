/**
 * The shared front-matter parser (DESIGN §4.1). A line scanner finds the opening `---` on the
 * first non-blank line and the closing `---` at the same indent; the YAML between them is read
 * in place. Nothing is rewritten and every range is an offset into the original source.
 */
import { CR, LF } from '../parser-kit/char-codes.js';
import { isSpace } from '../parser-kit/chars.js';
import type { Diagnostics } from '../parser-kit/diagnostics.js';
import type { Range } from '../parser-kit/positions.js';
import { lineEnd, newlineAt } from '../parser-kit/scanner.js';
import { isYamlMap, parseYaml } from './yaml.js';
import type { YamlMap, YamlValue } from './yaml.js';

export interface FrontMatter {
  /** The whole block, from the opening fence to the end of the closing fence's line break. */
  range: Range;
  /** The YAML text between the fences. */
  yamlRange: Range;
  /** The parsed YAML document (`null` when it is empty, not a mapping, or invalid). */
  data: YamlMap | null;
  /** `title`, as v12 reads it: any truthy value, as a string. */
  title?: string;
  /**
   * `config` as written (a plain, unmerged object), with the legacy top-level `displayMode`
   * moved to `gantt.displayMode` as in v12. Config resolution (merge, secure keys) is not done here.
   */
  config?: Record<string, unknown>;
}

export interface FrontMatterScan {
  frontMatter?: FrontMatter;
  /** Where the diagram text starts (after the front matter, or 0 when there is none). */
  bodyStart: number;
}

/** Horizontal whitespace as v12's fence regex sees it (`\s` without line breaks). */
function isHSpace(c: number): boolean {
  return c !== 10 && c !== 13 && isSpace(c);
}

/** End of the run of horizontal whitespace starting at `at`. */
function hspace(src: string, at: number): number {
  let i = at;
  while (i < src.length && isHSpace(src.charCodeAt(i))) i++;
  return i;
}

/** Offset after the line break at `at` (or `at` itself at the end of the source). */
function nextLine(src: string, at: number): number {
  return at + newlineAt(src, at);
}

/** True when the line `[start, end)` is `indent---` plus trailing horizontal whitespace. */
function isFence(src: string, start: number, end: number, indent: string): boolean {
  if (!src.startsWith(indent, start)) return false;
  const dash = start + indent.length;
  if (!src.startsWith('---', dash)) return false;
  return hspace(src, dash + 3) === end;
}

/** Find, read and interpret the front matter at the start of `src`. */
export function scanFrontMatter(src: string, diagnostics: Diagnostics): FrontMatterScan {
  // The opening fence is on the first non-blank line.
  let lineStart = 0;
  for (;;) {
    const first = hspace(src, lineStart);
    const nl = newlineAt(src, first);
    if (nl === 0) break;
    lineStart = first + nl;
  }
  const dash = hspace(src, lineStart);
  const openEnd = lineEnd(src, dash);
  const indent = src.slice(lineStart, dash);
  if (!isFence(src, lineStart, openEnd, indent)) return { bodyStart: 0 };

  const opener: Range = { start: dash, end: dash + 3 };
  const yamlStart = nextLine(src, openEnd);
  let at = yamlStart;
  while (at < src.length) {
    const end = lineEnd(src, at);
    if (isFence(src, at, end, indent)) {
      const bodyStart = nextLine(src, end);
      return {
        bodyStart,
        frontMatter: interpret(
          src,
          { start: lineStart, end: bodyStart },
          yamlStart,
          at,
          indent,
          diagnostics
        ),
      };
    }
    if (end >= src.length) break;
    at = nextLine(src, end);
  }

  diagnostics.error(
    'UNCLOSED_FRONT_MATTER',
    `The front matter is never closed. Add a line with ${indent ? 'the same indent and ' : ''}\`---\` after it.`,
    { start: src.length, end: src.length },
    { related: [{ message: 'The front matter starts here.', range: opener }] }
  );
  // The unclosed block runs to the end, like an unclosed string; nothing is left for the diagram.
  return { bodyStart: src.length };
}

function interpret(
  src: string,
  range: Range,
  yamlStart: number,
  yamlEnd: number,
  indent: string,
  diagnostics: Diagnostics
): FrontMatter {
  // The YAML ends before the line break that precedes the closing fence.
  let end = yamlEnd;
  if (end > yamlStart && src.charCodeAt(end - 1) === LF) end--;
  if (end > yamlStart && src.charCodeAt(end - 1) === CR) end--;
  const yamlRange = { start: yamlStart, end };
  const yaml = parseYaml(src, { start: yamlStart, end, indent });
  for (const d of yaml.diagnostics) diagnostics.list.push(d);

  const fm: FrontMatter = { range, yamlRange, data: null };
  const value = yaml.value;
  if (value === null) return fm;
  if (!isYamlMap(value)) {
    diagnostics.warning(
      'FRONT_MATTER_NOT_A_MAPPING',
      'The front matter should be a YAML mapping such as `title: …`; it was ignored.',
      yamlRange
    );
    return fm;
  }
  fm.data = value;
  const { title, config, displayMode } = value;
  // v12 keeps `title` and `displayMode` only when truthy, as strings.
  if (title) fm.title = String(title);
  if (config !== undefined && config !== null) {
    if (isYamlMap(config)) fm.config = config;
    else {
      diagnostics.warning(
        'FRONT_MATTER_CONFIG',
        'The front matter `config` should be a mapping of config keys; it was ignored.',
        yamlRange
      );
    }
  }
  if (displayMode) {
    const cfg = (fm.config ??= {});
    const gantt = cfg.gantt;
    if (gantt === undefined || gantt === null) cfg.gantt = { displayMode: String(displayMode) };
    else if (isYamlMap(gantt as YamlValue)) (gantt as YamlMap).displayMode = String(displayMode);
  }
  return fm;
}
