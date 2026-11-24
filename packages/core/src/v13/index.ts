/**
 * The v13 diagram contract: v13's `DiagramPlugin`, its render context and typed errors (v13's
 * `core/src/index.ts`, without the render pipeline, extensions and plugin manifests).
 */
export {
  errorFromDiagnostics,
  MermaidError,
  NotLoadedError,
  UnsupportedFormatError,
  type MermaidErrorCode,
  type MermaidErrorInit,
  type Resource,
} from './pipeline/errors.js';
/** The block nesting limit (ADR-15), shared with the editor through the parser kit. */
export { MAX_BLOCK_DEPTH, openerRange, tooDeep } from './parser-kit/embed-depth.js';
export type {
  IconifyAlias,
  IconifyIcon,
  IconifyJSON,
  IconPacks,
  IconPackSource,
  IconPackState,
} from './pipeline/icon-packs.js';
export type {
  DiagramIcon,
  DiagramParseContext,
  DiagramPlugin,
  GlyphOptions,
  IconLookup,
  IconOptions,
  EmbeddedDiagram,
  EmbeddedText,
  RenderContext,
  TextRenderContext,
  Warning,
} from './pipeline/types.js';
