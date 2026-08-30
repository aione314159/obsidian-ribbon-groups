/**
 * The only file that touches Obsidian's internals.
 *
 * There is no public API for listing or reordering ribbon buttons —
 * `addRibbonIcon()` only adds your own. Grouping therefore has to go through
 * the private `app.workspace.leftRibbon` object and the ribbon's own DOM, and
 * either of those can change in any release.
 *
 * Hence the rule here: **a failed detection must say where it failed.**
 * `probeRibbon()` always returns diagnostics, the settings pane displays them,
 * and a user who pastes them back has told us exactly what to fix. Failing
 * silently is the worst outcome — the plugin looks broken with no clue why.
 */

import type { App } from 'obsidian';
import { t } from './i18n';
import type { RibbonItem } from './types';

/**
 * Candidate selectors for the button container; the first hit wins.
 *
 * These names are not guesses, they were read out of Obsidian itself:
 * `containerEl = createDiv("workspace-ribbon side-dock-ribbon")`, and on the
 * left side `ribbonItemsEl = containerEl.createDiv("side-dock-actions")`.
 * The last entry is a coarse last resort that also sweeps in the settings area.
 */
const CONTAINER_SELECTORS = [
  '.workspace-ribbon.mod-left .side-dock-actions',
  '.side-dock-ribbon.mod-left .side-dock-actions',
  '.workspace-ribbon.mod-left',
];

/** Selector for a single ribbon button. */
export const ACTION_SELECTOR = '.side-dock-ribbon-action';

/** Marks the elements this plugin inserts, so scans can skip them. */
export const GROUP_CLASS = 'ribbon-groups-group';

interface InternalRibbonItem {
  /** Obsidian builds this as `manifest.id + ':' + title`. */
  id?: string;
  title?: string;
  icon?: string;
  /** The user switched this button off in Obsidian's own settings. */
  hidden?: boolean;
  /** The matching DOM node. Obsidian keeps the reference, so no lookup by label. */
  buttonEl?: HTMLElement;
}

interface InternalRibbon {
  items?: InternalRibbonItem[];
  ribbonItemsEl?: HTMLElement;
  containerEl?: HTMLElement;
}

export interface RibbonProbe {
  /** Container and buttons were both found; grouping can be applied. */
  ok: boolean;
  container: HTMLElement | null;
  items: RibbonItem[];
  /** One line per detection step. The settings pane shows them verbatim. */
  diagnostics: string[];
}

export function probeRibbon(app: App): RibbonProbe {
  const diagnostics: string[] = [];
  const ribbon = (app.workspace as unknown as { leftRibbon?: InternalRibbon }).leftRibbon;

  diagnostics.push(t.diagLeftRibbon(Boolean(ribbon)));

  const container = findContainer(ribbon, diagnostics);
  if (!container) {
    return { ok: false, container: null, items: [], diagnostics };
  }

  const elements = Array.from(container.querySelectorAll<HTMLElement>(ACTION_SELECTOR));
  diagnostics.push(t.diagButtonEls(elements.length));

  const items = buildItems(ribbon, elements, diagnostics);
  return { ok: items.length > 0, container, items, diagnostics };
}

function findContainer(ribbon: InternalRibbon | undefined, diagnostics: string[]): HTMLElement | null {
  // If the internal object hands us the container, use it: least to go wrong.
  if (ribbon?.ribbonItemsEl instanceof HTMLElement) {
    diagnostics.push(t.diagContainerFromItemsEl);
    return ribbon.ribbonItemsEl;
  }

  for (const selector of CONTAINER_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
      diagnostics.push(t.diagContainerFromSelector(selector));
      return el;
    }
  }

  diagnostics.push(t.diagContainerNotFound(CONTAINER_SELECTORS.join(', ')));
  return null;
}

/**
 * Pair the internal items with their DOM nodes.
 *
 * `buttonEl` is the first choice: Obsidian already holds that reference, which
 * beats looking the node up by `aria-label` (two buttons with the same title
 * would be matched to the wrong node). Title matching is the fallback.
 *
 * Buttons the user hid in Obsidian's own settings (`hidden`) are left out of
 * grouping: their DOM node still exists but is not displayed, so moving it into
 * a group would only add an invisible gap.
 *
 * Buttons present in the DOM but absent from `items` are picked up too. Some
 * plugins insert elements into the ribbon directly, and skipping them would
 * leave them stranded outside every group.
 */
function buildItems(
  ribbon: InternalRibbon | undefined,
  elements: HTMLElement[],
  diagnostics: string[]
): RibbonItem[] {
  const internal = Array.isArray(ribbon?.items) ? ribbon.items : [];
  diagnostics.push(t.diagItemsCount(internal.length));

  const byLabel = new Map<string, HTMLElement>();
  for (const el of elements) {
    const label = labelOf(el);
    if (label && !byLabel.has(label)) byLabel.set(label, el);
  }

  const items: RibbonItem[] = [];
  const used = new Set<HTMLElement>();
  let fromButtonEl = 0;
  let hidden = 0;

  for (const raw of internal) {
    const title = raw.title ?? '';

    if (raw.hidden) {
      hidden += 1;
      // Mark it used, or the DOM-only pass below would pick it back up
      if (raw.buttonEl instanceof HTMLElement) used.add(raw.buttonEl);
      continue;
    }

    let el: HTMLElement | null = null;
    if (raw.buttonEl instanceof HTMLElement) {
      el = raw.buttonEl;
      fromButtonEl += 1;
    } else if (title) {
      el = byLabel.get(title) ?? null;
    }

    if (el) used.add(el);
    items.push({ id: raw.id ?? `title:${title}`, title: title || t.unnamed, el });
  }

  let extra = 0;
  for (const el of elements) {
    if (used.has(el)) continue;
    const label = labelOf(el);
    items.push({ id: `dom:${label || items.length}`, title: label || t.unnamed, el });
    extra += 1;
  }

  diagnostics.push(t.diagFromButtonEl(fromButtonEl));
  if (hidden > 0) diagnostics.push(t.diagHidden(hidden));
  if (extra > 0) diagnostics.push(t.diagDomOnly(extra));

  const unmatched = items.filter((i) => !i.el).length;
  if (unmatched > 0) diagnostics.push(t.diagUnmatched(unmatched));

  return items;
}

function labelOf(el: HTMLElement): string {
  return el.getAttribute('aria-label') ?? el.getAttribute('title') ?? '';
}

/**
 * Open this plugin's own page in Obsidian's settings window.
 *
 * `app.setting` is not part of the public API — `Plugin` can add a settings tab
 * but cannot ask for it to be shown. The two calls are guarded rather than
 * assumed: a release that renames either one should leave the context menu item
 * doing nothing, not throw out of the click handler and take the menu with it.
 *
 * Returns whether the page was actually opened, so the caller can tell the user
 * instead of leaving them looking at a menu item that quietly does nothing.
 */
export function openPluginSettings(app: App, pluginId: string): boolean {
  const setting = (app as unknown as { setting?: { open?: () => void; openTabById?: (id: string) => void } })
    .setting;
  if (typeof setting?.open !== 'function' || typeof setting.openTabById !== 'function') return false;

  setting.open();
  setting.openTabById(pluginId);
  return true;
}
