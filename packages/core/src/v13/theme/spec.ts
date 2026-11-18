/**
 * The types of v13's `theme/spec.ts` that diagram theme tables use. v13's theme specs are not
 * ported: themes come from v12's theme variables.
 */

/** Derivation rules by variable name, in the DSL of `dsl.ts`. */
export type ThemeRuleTable = Readonly<Record<string, string>>;
