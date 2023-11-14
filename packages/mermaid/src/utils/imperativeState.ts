/**
 * Resettable state storage.
 *
 * @example
 * ```
 * // you can use the `domain` functions for easier typing
 * const state = new ImperativeState(() => {
 *   foo: domain.optional<string>("default"),
 *   bar: domain.identity<number[]>([]),
 *   baz: domain.optional(1),
 * });
 *
 * state.records.foo = "hi";
 * console.log(state.records.foo); // prints "hi";
 * state.reset();
 * console.log(state.records.foo); // prints "default";
 *
 * // typeof state.records:
 * // {
 * //   foo: string | undefined, // actual: undefined
 * //   bar: number[],           // actual: []
 * //   baz: number | undefined, // actual: 1
 * // }
 * ```
 */
export class ImperativeState<S extends Record<string, unknown>> {
  init: () => S;
  records: S;

  /**
   * @param init - Function that creates the default state.
   */
  constructor(init: () => S) {
    this.init = init;
    this.records = init();
  }

  reset() {
    Object.keys(this.records).forEach((key) => {
      delete this.records[key];
    });
    Object.entries(this.init()).forEach(
      ([key, value]: [
        keyof S,
        any // eslint-disable-line @typescript-eslint/no-explicit-any
      ]) => {
        this.records[key] = value;
      }
    );
  }
}

/**
 * TypeScript helpers for {@link ImperativeState}.
 *
 * Using `as MyType` is more performant, since then we don't need to call a function.
 *
 * @example
 * ```
 * state = new ImperativeState(() => {
 *   foo: domain.optional<string>("default"),
 * });
 * // is equivalent (but faster)
 * state = new ImperativeState(() => {
 *   foo: "default" as string | undefined,
 * });
 * ```
 */
export const domain = {
  optional: <V>(value?: V) => value,
  identity: <V>(value: V) => value,
} as const;
