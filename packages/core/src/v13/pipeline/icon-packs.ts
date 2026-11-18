/**
 * Icon packs (D290, D294): the Iconify JSON shapes v12 took, and the read-only view of one
 * `mermaid` API object's pack registry that an icons extension gets through
 * `ResourceRequest.iconPacks` and `RenderContext.iconPacks`. Core keeps no packs itself.
 */

/** One Iconify icon: an SVG body in its own view box (`@iconify/types` `IconifyIcon`). */
export interface IconifyIcon {
  readonly body: string;
  readonly left?: number;
  readonly top?: number;
  readonly width?: number;
  readonly height?: number;
  readonly rotate?: number;
  readonly hFlip?: boolean;
  readonly vFlip?: boolean;
}

/** An alias of another icon in the pack, with optional transformations. */
export interface IconifyAlias extends Omit<IconifyIcon, 'body'> {
  readonly parent: string;
}

/**
 * An Iconify JSON icon set, as `@iconify-json/*` packages export it (`@iconify/types`
 * `IconifyJSON`, the fields mermaid reads). Pack-wide `left`/`top`/`width`/`height` are the
 * defaults of its icons.
 */
export interface IconifyJSON {
  readonly prefix: string;
  readonly icons: Readonly<Record<string, IconifyIcon>>;
  readonly aliases?: Readonly<Record<string, IconifyAlias>>;
  readonly left?: number;
  readonly top?: number;
  readonly width?: number;
  readonly height?: number;
  readonly lastModified?: number;
  readonly not_found?: readonly string[];
}

/**
 * A registered pack's state: `ready` has its icons; `pending` has a loader that has not run
 * (or is running); `failed` has a loader whose last run rejected, which the next `prepare()`
 * retries (D299).
 */
export type IconPackState = 'ready' | 'pending' | 'failed';

/**
 * One `mermaid` API object's icon packs (D294), read-only. An icons extension's
 * `resources.missing` reports each pack a diagram names that is not `ready` as
 * `{ kind: 'iconPack', name }`; the API object loads it (the extension need not provide it). A
 * pack that is not registered is ignored there: its icons are unresolved (D291), not missing.
 * `mermaid` does not warn about a `failed` pack: the extension does, naming it (D299).
 */
export interface IconPacks {
  /** Every registered pack name, in registration order. */
  names(): readonly string[];
  /** The state of pack `name`, or `undefined` when no pack of that name is registered. */
  state(name: string): IconPackState | undefined;
  /**
   * Pack `name` once it is `ready`, as registered or loaded with `prefix` set to the registered
   * name (v12). It is not checked: the extension checks it is Iconify JSON.
   */
  get(name: string): IconifyJSON | undefined;
  /**
   * Why pack `name`'s loader last failed: the error's message, untruncated (shorten it for a
   * warning). Read it while the pack is `failed`; it is not cleared by a later load.
   */
  error(name: string): string | undefined;
}

/** {@link IconPacks} plus its loader, for the resource request (D294). */
export interface IconPackSource extends IconPacks {
  /**
   * Runs pack `name`'s loader; resolves (never rejects) once it is `ready` or `failed`, or once the
   * pack registered in its place meanwhile is. A function property, so a view can leave it out.
   */
  readonly load: (name: string) => Promise<void>;
}
