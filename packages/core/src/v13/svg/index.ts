/**
 * SvgWriter, escaping and url/style/colour safety (DESIGN §7, §10).
 */
export type {
  AllowedAttr,
  AllowedTag,
  Attrs,
  AttrTypes,
  Brand,
  EmbeddedSvg,
  GradientAttr,
  GradientRef,
  GradientTag,
  Length,
  LinearGradient,
  LinkTarget,
  OutlinePaint,
  Paint,
  PathData,
  SafeColor,
  SafeFilter,
  SafeLength,
  SafeUrl,
  SafeValue,
  StopColor,
  StyleText,
  SvgGradient,
  SvgWarning,
  ThemeRef,
  ThemeStyleSheet,
  Transform,
  Warn,
} from './types.js';
export { ALLOWED_ATTRS, ALLOWED_TAGS, SVG_NS } from './allowlist.js';
export { esc, num } from './escape.js';
export { pathBuilder, rotate, scale, transforms, translate, type PathBuilder } from './path.js';
export type { SvgMatch, SvgNode, SvgTree } from './tree.js';
export {
  streamWriter,
  treeWriter,
  type LabelBox,
  type LabelSpan,
  type OutlineDraw,
  type OutlineRole,
  type OutlineSink,
  type OutlineTag,
  type StreamSvgWriter,
  type SvgWriter,
  type TreeSvgWriter,
  type WriterOptions,
  writeFragment,
} from './writer.js';
export {
  checkImageUrl,
  checkLinkTarget,
  checkUrl,
  isImageDataUrl,
  resolveSecurityLevel,
  type SecurityLevel,
  type UrlOptions,
} from './url.js';
export {
  checkColor,
  checkFilter,
  checkLength,
  checkStyle,
  px,
  styleScope,
  styleText,
  themeRef,
  themeStyleSheet,
  STYLE_PROPERTIES,
  type CheckedStyle,
} from './style.js';
export { assertInert, embeddedSvg, inertProblem, type InertOptions } from './inert.js';
