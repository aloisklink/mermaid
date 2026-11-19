# @mermaid-js/plugin-interactions

Sequence diagram actor menus (`link`, `links`, `properties`, `details`), ported from [mermaid-v13](https://github.com/mermaid-js/mermaid-v13/tree/87edaac12eb324c461caf6b923f4d50390dcf9b3/packages/plugin-interactions)'s interactions plugin without its click callbacks.

Register it to turn the menus on:

```js
import mermaid from '@mermaid-js/core';
import interactionsPlugins from '@mermaid-js/plugin-interactions';

mermaid.registerPlugins(interactionsPlugins);
```

Without it, menu statements parse but draw nothing.

Each menu is a `div.actorPopupMenu[data-menu-for="<actor>"]` inserted after the `<svg>` when `bindFunctions` runs. `mermaid.run` calls it; after `mermaid.render`, call `bindFunctions(element)` yourself. Inside is a `div.actorPopupMenuPanel` (plus `properties.class`) with one `a.actor` per link, opening in a new tab. Clicking the actor's top or bottom box toggles the menu below the top box; `sequence.forceMenus: true` shows them all. Links must be http, https, mailto or relative (relative only with `securityLevel: 'stricter'`); others become `about:blank`.

Unlike v12, menus are HTML outside the svg: they aren't part of the svg markup or exported images, don't enlarge the diagram, use inline styles rather than the diagram theme, and aren't drawn under `securityLevel: 'sandbox'`.

Calling `bindFunctions` again is safe: it rebinds only when the menus changed.
