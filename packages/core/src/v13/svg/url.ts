/**
 * Link URL checks (R-SEC-4, R-SEC-6, D48, D62).
 *
 * The stripping of control characters, entity codes and escapes that could hide a scheme
 * is a port of `@braintree/sanitize-url` (https://github.com/braintree/sanitize-url, MIT,
 * (c) 2017 Braintree) as Pele reimplements it (https://github.com/obsidianmd/pele, MIT,
 * (c) 2026 kepano, src/util/url.ts at 3a2f075). On top of that the scheme must be on an
 * allow-list, checked on both the raw and the percent-decoded form, and network paths
 * (`//host`, `\\host`) are refused.
 */
import { LINK_TARGETS } from './allowlist.js';
import type { LinkTarget, SafeUrl, Warn } from './types.js';

/** The two v13 security levels. */
export type SecurityLevel = 'default' | 'strict';

export interface UrlOptions {
  /** `default`: http, https, mailto and relative. `strict`: relative only. */
  readonly securityLevel?: SecurityLevel;
  /** Integrator-only replacement for the default scheme list (lowercase, without `:`). */
  readonly linkSchemes?: readonly string[];
  readonly warn?: Warn;
}

const DEFAULT_SCHEMES: readonly string[] = ['http', 'https', 'mailto'];
const V12_LEVELS: ReadonlySet<string> = new Set(['loose', 'antiscript', 'sandbox']);

/**
 * Maps a configured `securityLevel` to one of the two v13 levels. The other v12 values
 * are treated as the default, with a warning.
 */
export function resolveSecurityLevel(value: unknown, warn?: Warn): SecurityLevel {
  if (value === undefined || value === 'default') return 'default';
  if (value === 'strict') return 'strict';
  warn?.({
    code: 'SECURITY_LEVEL',
    message: V12_LEVELS.has(String(value))
      ? `securityLevel "${String(value)}" is no longer supported and is treated as the default level.`
      : `Unknown securityLevel ${JSON.stringify(value)}; using the default level.`,
  });
  return 'default';
}

// C0/C1 controls, spaces that render as nothing (U+2000-U+200D), BOM, lone surrogates and
// non-characters. `u` mode, so surrogate ranges only match unpaired halves.
// eslint-disable-next-line no-control-regex -- these are the characters being removed
const RE_CTRL = /[\u0000-\u001f\u007f-\u009f\u2000-\u200d\ufeff\ud800-\udfff\ufffe\uffff]/gu;
// HTML numeric character references; browsers accept them without the `;`.
const RE_NUMERIC_ENTITY = /&#(?:[xX]([0-9a-fA-F]{1,8})|(\d{1,10}));?/g;
// The named references that could hide a scheme or a path.
const RE_NAMED_ENTITY = /&([a-zA-Z]{2,8});/g;
const NAMED: Readonly<Record<string, string>> = {
  colon: ':',
  Tab: '\t',
  NewLine: '\n',
  sol: '/',
  bsol: '\\',
  period: '.',
  num: '#',
  quest: '?',
  percnt: '%',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};
// Mermaid's own entity codes (`#colon;`, `#58;`), which v12 turned into HTML entities.
const RE_MERMAID_ENTITY = /#(?:([a-zA-Z]{2,8})|(\d{1,10}));/g;
// `\n`, `\t`, `\r` written as backslash escapes, raw or percent-encoded.
const RE_WS_ESCAPE = /(?:\\|%5[cC])(?:%(?:6[eE]|72|74)|[nrt])/g;
const RE_SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
const RE_NETWORK_PATH = /^[\\/]{2}/;

function codePoint(n: number): string {
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
}

function decodePercent(uri: string): string {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
}

function decodeOnce(text: string, mermaid: boolean): string {
  let out = text
    .replace(RE_NUMERIC_ENTITY, (_m, hex: string | undefined, dec: string | undefined) =>
      codePoint(hex === undefined ? Number(dec) : parseInt(hex, 16))
    )
    .replace(RE_NAMED_ENTITY, (m, name: string) => NAMED[name] ?? m);
  if (mermaid) {
    out = out.replace(RE_MERMAID_ENTITY, (m, name: string | undefined, dec: string | undefined) =>
      name === undefined ? codePoint(Number(dec)) : (NAMED[name] ?? m)
    );
  }
  return out.replace(RE_CTRL, '').replace(RE_WS_ESCAPE, '');
}

// Strips what could hide a scheme until nothing changes. With `deep`, also percent escapes
// and Mermaid entity codes (the form an app that decodes the href before opening it sees).
// Undefined for a URL wrapped too many times to be a real one.
function unwrap(url: string, deep: boolean): string | undefined {
  let out = (deep ? decodePercent(url) : url).replace(RE_CTRL, '').trim();
  for (let round = 0; round < 32; round++) {
    let next = decodeOnce(out, deep).trim();
    if (deep) next = decodePercent(next);
    if (next === out) return out;
    out = next;
  }
  return undefined;
}

// Never part of a real URL; refusing them keeps markup-looking text out of links.
const RE_MARKUP = /[<>]/;

function allowed(url: string, schemes: readonly string[]): boolean {
  if (RE_NETWORK_PATH.test(url) || RE_MARKUP.test(url)) return false;
  const scheme = RE_SCHEME.exec(url);
  return scheme === null || schemes.includes((scheme[1] as string).toLowerCase());
}

/**
 * Checks a link URL. Returns the URL to write, with control characters and entity codes
 * removed, or undefined (with a warning) when it is refused. Percent escapes are kept.
 */
export function checkUrl(url: string, options: UrlOptions): SafeUrl | undefined {
  const schemes =
    options.securityLevel === 'strict' ? [] : (options.linkSchemes ?? DEFAULT_SCHEMES);
  const kept = typeof url === 'string' ? unwrap(url, false) : undefined;
  const decoded = typeof url === 'string' ? unwrap(url, true) : undefined;
  if (kept && decoded !== undefined && allowed(kept, schemes) && allowed(decoded, schemes)) {
    return kept as SafeUrl;
  }
  options.warn?.({
    code: 'URL_REFUSED',
    message: `The link ${JSON.stringify(String(url).slice(0, 200))} was removed: ${
      options.securityLevel === 'strict'
        ? 'only relative links are allowed'
        : `only ${schemes.join(', ')} and relative links are allowed`
    }.`,
  });
  return undefined;
}

// Raster images as data URLs (R-SEC-2's allow-listed image types). Never SVG: it can script.
const RE_DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp)(?:;base64)?,/i;

/** Whether `url` is a data URL of an allowed raster image type. */
export function isImageDataUrl(url: string): boolean {
  return RE_DATA_IMAGE.test(url) && !RE_MARKUP.test(url);
}

/**
 * Checks an image source (`<image href>`): relative, `http`/`https` (not under `strict`), or a
 * raster data URL. Mail and integrator link schemes are for links, not images.
 */
export function checkImageUrl(
  url: string,
  options: Pick<UrlOptions, 'securityLevel' | 'warn'>
): SafeUrl | undefined {
  const schemes = options.securityLevel === 'strict' ? [] : ['http', 'https'];
  const kept = typeof url === 'string' ? unwrap(url, false) : undefined;
  const decoded = typeof url === 'string' ? unwrap(url, true) : undefined;
  if (kept && decoded !== undefined) {
    if (isImageDataUrl(kept) && isImageDataUrl(decoded)) return kept as SafeUrl;
    if (allowed(kept, schemes) && allowed(decoded, schemes)) return kept as SafeUrl;
  }
  options.warn?.({
    code: 'URL_REFUSED',
    message: `The image ${JSON.stringify(String(url).slice(0, 200))} was removed: ${
      options.securityLevel === 'strict'
        ? 'only relative and data:image sources are allowed'
        : 'only http, https, relative and data:image (png, jpeg, gif, webp) sources are allowed'
    }.`,
  });
  return undefined;
}

/** Keeps the v12 link targets; any other value is dropped with a warning. */
export function checkLinkTarget(target: string | undefined, warn?: Warn): LinkTarget | undefined {
  if (target === undefined || target === '') return undefined;
  if (LINK_TARGETS.has(target)) return target as LinkTarget;
  warn?.({
    code: 'LINK_TARGET_DROPPED',
    message: `Link target ${JSON.stringify(target.slice(0, 100))} was dropped: use _self, _blank, _parent or _top.`,
  });
  return undefined;
}
