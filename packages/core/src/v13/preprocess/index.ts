/**
 * Preprocess (DESIGN §4.1, D67): locate front matter and `%%{…}%%` directives without
 * rewriting the source. Everything returned is a range into the original text.
 */
export { preprocess } from './preprocess.js';
export type { PreprocessResult } from './preprocess.js';
export { diagramStart } from './diagram-start.js';
export { detectText, firstPartyDetects } from './detect-text.js';
export type { DetectTextOptions } from './detect-text.js';
export type { FrontMatter } from './frontmatter.js';
export { MAX_DIRECTIVE_DEPTH } from './directives.js';
export type { Directive, DirectiveKind } from './directives.js';
export { isYamlMap, MAX_YAML_DEPTH, parseYaml } from './yaml.js';
export type { YamlMap, YamlOptions, YamlResult, YamlValue } from './yaml.js';
export type { YamlTreeOptions, YamlTreeResult } from './yaml.js';
export type {
  YamlMapNode,
  YamlNode,
  YamlPair,
  YamlScalarNode,
  YamlScalarStyle,
  YamlSeqNode,
} from './yaml-nodes.js';
