/**
 * Preprocess (DESIGN §4.1, D67, R-COMPAT-6): find the front matter and the `%%{…}%%`
 * directives and read them, without rewriting the source. There is no SourceMap: the body,
 * the front matter, the directives and every diagnostic are ranges into the original text.
 * `%%` comments, CRLF and entities are left to the lexers and label parsers.
 */
import { Diagnostics } from '../parser-kit/diagnostics.js';
import type { Diagnostic } from '../parser-kit/diagnostics.js';
import { scanDirectives } from './directives.js';
import type { Directive } from './directives.js';
import { scanFrontMatter } from './frontmatter.js';
import type { FrontMatter } from './frontmatter.js';

export interface PreprocessResult {
  /** Offset where the diagram text starts; detection and the diagram parser start here. */
  bodyStart: number;
  frontMatter?: FrontMatter;
  /** Every `%%{…}%%` in the body, in source order. They stay in the text as trivia. */
  directives: Directive[];
  /** Errors and warnings from the front matter and the directives. */
  diagnostics: Diagnostic[];
}

/** Preprocess one diagram source. Linear in its length; never throws on any input. */
export function preprocess(src: string): PreprocessResult {
  const diagnostics = new Diagnostics();
  const { bodyStart, frontMatter } = scanFrontMatter(src, diagnostics);
  const directives = scanDirectives(src, bodyStart, diagnostics);
  const result: PreprocessResult = { bodyStart, directives, diagnostics: diagnostics.list };
  if (frontMatter) result.frontMatter = frontMatter;
  return result;
}
