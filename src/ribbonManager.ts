/**
 * Applying the grouping to the ribbon, and taking it back off.
 *
 * Two things decide whether this plugin causes trouble:
 *
 * 1. **Restore has to be clean.** After the plugin is disabled the ribbon must
 *    look as if it had never been installed. The original order of the buttons
 *    inside the container is recorded before the first apply, and restore
 *    appends them back in that order before removing the group wrappers.
 *    Failing at this means buttons disappear or end up shuffled and only a
 *    restart fixes it — the kind of breakage that is hardest to get reported
 *    and does the most damage to trust.
 *
 * 2. **Do not fight other plugins.** Any plugin may call `addRibbonIcon()`
 *    after load, and the new button goes straight into the container, outside
 *    our wrappers. A MutationObserver catches that and reapplies, so the button
 *    joins the ungrouped area instead of floating above everything.
 */

import { setIcon, type App } from 'obsidian';
import { layout } from './groupLayout';
import { ACTION_SELECTOR, GROUP_CLASS, probeRibbon, type RibbonProbe } from './ribbonDom';
import type { RibbonGroupsSettings, RibbonItem } from './types';

export class RibbonManager {
  private container: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  /** Button order inside the container before the first apply. */
  private originalOrder: HTMLElement[] = [];
  /** Wrappers this plugin created; all of them go away on restore. */
  private ownedEls: HTMLElement[] = [];
  /** Whether to keep watching. After stop(), a stray apply() must not re-arm it. */
  private watching = false;

  constructor(
    private readonly app: App,
    private readonly getSettings: () => RibbonGroupsSettings,
    /** Notifies the caller to save when the user collapses or expands a group. */
    private readonly onToggleCollapse: (groupId: string, collapsed: boolean) => void
  ) {}

  probe(): RibbonProbe {
    return probeRibbon(this.app);
  }

  /** Take over the ribbon. */
  start(): void {
    this.watching = true;
    this.apply();
  }

  /** Stop and restore. Must be called on unload. */
  stop(): void {
    this.watching = false;
    this.observer?.disconnect();
    this.observer = null;
    this.restore();
  }

  /** Re-lay out from the current settings. The settings pane calls this on every change. */
  apply(): void {
    const probe = this.probe();
    if (!probe.ok || !probe.container) return;

    // Detach the observer before touching the DOM. A flag is not enough: the
    // observer callback runs as a microtask, by which point apply() has already
    // returned and reset the flag, so our own moves would be read as "someone
    // added a button" and trigger another pass — forever.
    this.observer?.disconnect();
    try {
      // Only the first apply records the original order. Every later pass
      // operates on a ribbon this plugin has already rearranged, so recording
      // again would capture the grouped order and make restore a no-op.
      if (this.container !== probe.container) {
        this.container = probe.container;
        this.originalOrder = Array.from(probe.container.querySelectorAll<HTMLElement>(ACTION_SELECTOR));
      }

      this.removeOwnedEls();
      this.render(probe.container, probe.items);
    } finally {
      if (this.watching) this.watch(probe.container);
    }
  }

  private render(container: HTMLElement, items: RibbonItem[]): void {
    const settings = this.getSettings();
    const byId = new Map(items.map((i) => [i.id, i]));
    const blocks = layout(settings, items.filter((i) => i.el).map((i) => i.id));

    for (const block of blocks) {
      const wrapper = container.createDiv({
        cls: block.kind === 'group' ? `${GROUP_CLASS} is-group` : `${GROUP_CLASS} is-loose`,
      });
      this.ownedEls.push(wrapper);
      // Compact mode is a class on our own wrappers rather than on the ribbon
      // container, which belongs to Obsidian: anything set there would outlive
      // the plugin being disabled.
      wrapper.toggleClass('is-compact', settings.compact);

      if (block.kind === 'group') {
        const { group } = block;
        wrapper.dataset.groupId = group.id;
        if (group.color) wrapper.style.setProperty('--rg-color', group.color);
        wrapper.toggleClass('has-color', Boolean(group.color));
        wrapper.toggleClass('is-collapsed', group.collapsed);

        if (group.icon) {
          const icon = wrapper.createDiv({ cls: 'ribbon-groups-icon' });
          setIcon(icon, group.icon);
          icon.setAttribute('aria-label', group.title);
          icon.addEventListener('click', () => this.onToggleCollapse(group.id, !group.collapsed));
        }

        if (group.showTitle) {
          const title = wrapper.createDiv({ cls: 'ribbon-groups-title', text: group.title });
          title.setAttribute('aria-label', group.title);
          title.addEventListener('click', () => this.onToggleCollapse(group.id, !group.collapsed));
        }
      }

      const slot = wrapper.createDiv({ cls: 'ribbon-groups-items' });
      for (const id of block.itemIds) {
        const el = byId.get(id)?.el;
        // appendChild moves the node out of wherever it was, which is the point
        if (el) slot.appendChild(el);
      }
    }
  }

  /**
   * Restore.
   *
   * Only nodes still inside our container are put back. Some buttons are
   * removed by Obsidian after an apply — their plugin was disabled — and
   * `originalOrder` still holds those references; appending them blindly would
   * insert dead buttons into the ribbon.
   */
  private restore(): void {
    const container = this.container;
    if (!container) return;

    const alive = this.originalOrder.filter((el) => container.contains(el));
    this.removeOwnedEls();
    for (const el of alive) container.appendChild(el);

    this.container = null;
    this.originalOrder = [];
  }

  private removeOwnedEls(): void {
    for (const el of this.ownedEls) {
      // The buttons inside a wrapper are not ours. Move them out before
      // removing the wrapper, or they are destroyed along with it.
      const parent = el.parentElement;
      if (parent) {
        for (const action of Array.from(el.querySelectorAll<HTMLElement>(ACTION_SELECTOR))) {
          parent.appendChild(action);
        }
      }
      el.remove();
    }
    this.ownedEls = [];
  }

  /**
   * Watch for buttons other plugins add after load.
   *
   * Only a button appearing as a direct child of the container counts. Changes
   * inside our own wrappers are self-inflicted and must not feed back into
   * another pass.
   */
  private watch(container: HTMLElement): void {
    if (!this.observer) {
      this.observer = new MutationObserver((records) => {
        const added = records.some((r) =>
          Array.from(r.addedNodes).some((n) => n.instanceOf(HTMLElement) && n.matches(ACTION_SELECTOR))
        );
        if (added) this.apply();
      });
    }

    // Drop records accumulated while disconnected, or reattaching would replay
    // our own moves back at us.
    this.observer.takeRecords();
    this.observer.observe(container, { childList: true });
  }
}
