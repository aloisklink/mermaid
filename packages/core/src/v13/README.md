# `@mermaid-js/core/v13`

Modules ported from [mermaid-v13](https://github.com/mermaid-js/mermaid-v13) at
[`87edaac`](https://github.com/mermaid-js/mermaid-v13/tree/87edaac12eb324c461caf6b923f4d50390dcf9b3/packages)
for diagrams written against v13's diagram contract.

`v13/<dir>` holds v13's `packages/core/src/<dir>`, `v13/shared/<dir>` (when needed) holds v13's
`packages/shared/src/<dir>`, and `v13/mermaid/` holds files from v13's `packages/mermaid/src`.
The code is kept as close to v13 as this repo's lint rules allow, so that later v13 changes can
be ported over. Comments that cite `DESIGN §…`, `D…`, `R-…`,
`#…` or `tools/…` refer to the design notes, issues and tooling of the mermaid-v13 repository.
Generated files (such as `parser-kit/unicode-table.ts`) are regenerated there and copied over.

Only what v13 diagrams need is ported. The index files, `config/`, and `theme/spec.ts` and
`theme/theme.ts` are trimmed to that: their header comments say what they leave out. v13
diagrams read v12's config and v12's theme variables, not v13's.
