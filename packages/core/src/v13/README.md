# `@mermaid-js/core/v13`

Modules ported from [mermaid-v13](https://github.com/mermaid-js/mermaid-v13) at
[`87edaac`](https://github.com/mermaid-js/mermaid-v13/tree/87edaac12eb324c461caf6b923f4d50390dcf9b3/packages)
for diagrams written against v13's diagram contract.

`v13/<dir>` holds v13's `packages/core/src/<dir>`, and `v13/shared/<dir>` (when needed) holds v13's
`packages/shared/src/<dir>`. The code is kept as close to v13 as this repo's lint rules allow,
so that later v13 changes can be ported over. Comments that cite `DESIGN §…`, `D…`, `R-…`,
`#…` or `tools/…` refer to the design notes, issues and tooling of the mermaid-v13 repository.
Generated files (such as `parser-kit/unicode-table.ts`) are regenerated there and copied over.
