# Open Ribbon Groups

Group the buttons in the left ribbon into labeled, color-coded sections, and reorder them by dragging.

[Traditional Chinese README](./README.zh-TW.md)

![The left ribbon with two colored groups and an ungrouped section](./docs/images/ribbon.png)

Once you have a dozen plugins installed, the ribbon turns into one long column of unrelated
icons. This plugin lets you split it into blocks such as "Writing", "Sync" and "Dev",
separated by color.

Requires Obsidian 1.8.7 or later.

## Features

- Groups, each with a background color (eight built-in swatches), a title and an optional icon
- Titles can be turned off — the ribbon is only about 42px wide, so long ones get truncated
- Click a title or icon to collapse the whole group; commands collapse or expand every group at once
- The settings tab lists the buttons currently on your ribbon; drag them into groups
- Groups themselves can be dragged to change their order
- Dragging works with a mouse, a pen or a finger, and scrolls the pane when you reach its edge
- Filter the ungrouped list by name when a vault has more buttons than fit on screen
- Compact spacing, for when a short window cannot fit every group
- Copy your groups out as JSON and paste them into another vault
- Ungrouped buttons stay together, either above or below all groups
- English, Traditional Chinese, Simplified Chinese, Japanese and Korean, following the
  language set in Obsidian

## Please read this first

**Obsidian has no public API for listing or reordering ribbon buttons.** `addRibbonIcon()`
only adds your own button; it cannot touch anyone else's. This plugin reads the private
`app.workspace.leftRibbon` object plus the ribbon's own DOM.

That means: **if Obsidian changes that internal structure, this plugin will break** and will
need a fix to follow along.

It will not fail silently. The settings tab shows "Ribbon not found" together with the
structure it actually detected, and a button to copy that diagnostic text so you can file
an issue.

Disabling the plugin restores the ribbon to its original state — no restart needed.

## Privacy

This plugin makes no network requests, collects no telemetry, and requires no account.
All settings live in `data.json` inside the plugin's own folder in your vault.

Settings you paste into the import box are validated before they are used: group colors are
restricted to literal color syntax, so an imported file cannot smuggle in a `url()` that
would make your ribbon fetch something.

The settings tab has an "Open" button that reveals that folder in your system file manager.
It only ever points at the plugin's own folder inside the vault, and it is hidden when the
vault is not backed by a local file system (for example on mobile).

## Install

### From the community directory

Settings → Community plugins → Browse → search for "Open Ribbon Groups".

### Manually

Copy `main.js`, `styles.css` and `manifest.json` from the latest
[release](https://github.com/aione314159/obsidian-ribbon-groups/releases) into
`<vault>/.obsidian/plugins/ribbon-groups/`, then enable it under
Settings → Community plugins.

## Usage

Settings → Open Ribbon Groups:

1. Click "Add group", give it a name and pick a background color
2. Optionally type a [Lucide](https://lucide.dev/icons/) icon name, such as `folder-open`
3. Drag buttons from the "Ungrouped" list below into it
4. Use the `⠿` handle on the left to reorder groups

![The plugin's settings tab, with the drag handle, color swatches and button list annotated](./docs/images/settings.png)

Changes apply immediately; there is nothing to save.

Clicking a group title in the ribbon collapses it, and the collapsed state is remembered.

## When a plugin gets disabled

Its button disappears from the ribbon, but **its position is kept in the settings**. Re-enable
that plugin and the button returns to its original group — no need to rearrange anything.

If you are sure you are done with it, the settings tab shows "N buttons are no longer on the
ribbon" at the top; click "Clear" to drop them.

## Development

```bash
npm install
npm run build       # produces dist/{main.js, styles.css, manifest.json}
npm run dev         # watch mode
npm test            # vitest
npm run typecheck
```

Tests cover the group data operations (deduplication, where buttons go when a group is
deleted, what an import is allowed to contain) and the whole drop decision — which zone a
release lands in and at which index. DOM manipulation and the settings UI are out of scope;
those are verified through the diagnostic output in `ribbonDom.ts`.

## License

[MIT](./LICENSE)
