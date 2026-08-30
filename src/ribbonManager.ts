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

import { Menu, setIcon, type App } from 'obsidian';
import { layout, titleLabel } from './groupLayout';
import { RibbonDragController, type RibbonBlockRef } from './ribbonDrag';
import { t } from './i18n';
import { ACTION_SELECTOR, GROUP_CLASS, probeRibbon, type RibbonProbe } from './ribbonDom';
import type { RibbonGroup, RibbonGroupsSettings, RibbonItem } from './types';

/**
 * Label sizing on the ribbon.
 *
 * `TITLE_SIZE_PX` must match the fallback in `styles.css`; the floor is the
 * point below which a label stops being readable and the group icon is the
 * better answer anyway.
 */
/** Marks the transient "drop here to ungroup" area, so a stray one can be swept. */
const PLACEHOLDER_CLASS = 'ribbon-groups-placeholder';

const TITLE_SIZE_PX = 9;
const TITLE_MIN_SIZE_PX = 6;
const TITLE_STEP_PX = 0.5;

/**
 * What the manager hands back to the plugin.
 *
 * One object rather than a row of positional callbacks: the ribbon now reports
 * four different user actions, and four bare functions in a constructor call is
 * a line nobody can read without counting commas.
 */
export interface RibbonManagerCallbacks {
  /** The user collapsed or expanded a group from the ribbon. */
  setCollapsed: (groupId: string, collapsed: boolean) => void;
  /** The user hid a group from the ribbon's context menu. */
  setHidden: (groupId: string, hidden: boolean) => void;
  /** The user dragged a button to another group. */
  moveItem: (itemId: string, groupId: string | null, index: number) => void;
  /** The user asked for the settings page. */
  openSettings: () => void;
}

export class RibbonManager {
  private container: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  /** Button order inside the container before the first apply. */
  private originalOrder: HTMLElement[] = [];
  /** Wrappers this plugin created; all of them go away on restore. */
  private ownedEls: HTMLElement[] = [];
  /** Whether to keep watching. After stop(), a stray apply() must not re-arm it. */
  private watching = false;
  /**
   * Which item id each button belongs to.
   *
   * A WeakMap rather than a data attribute: the buttons are other plugins'
   * property, and anything written onto them is one more thing restore has to
   * remember to undo.
   */
  private readonly itemIds = new WeakMap<HTMLElement, string>();
  private readonly drag: RibbonDragController;

  constructor(
    private readonly app: App,
    private readonly getSettings: () => RibbonGroupsSettings,
    private readonly on: RibbonManagerCallbacks
  ) {
    this.drag = new RibbonDragController({
      idOf: (el) => this.itemIds.get(el) ?? null,
      blocks: () => this.blocks(),
      addPlaceholder: () => this.addPlaceholder(),
      move: (itemId, groupId, index) => this.on.moveItem(itemId, groupId, index),
    });
  }

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
    this.drag.detach();
    this.observer?.disconnect();
    this.observer = null;
    this.restore();
  }

  /** Re-lay out from the current settings. The settings pane calls this on every change. */
  apply(): void {
    const probe = this.probe();
    if (!probe.ok || !probe.container) return;

    // A drag in progress measured a layout that is about to be replaced.
    this.drag.cancel();
    // Its drop area is not in ownedEls, so sweep any that outlived a gesture.
    for (const el of Array.from(probe.container.querySelectorAll<HTMLElement>(`.${PLACEHOLDER_CLASS}`))) {
      el.remove();
    }

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
      if (this.watching) {
        this.drag.attach(probe.container);
        this.watch(probe.container);
      }
    }
  }

  private render(container: HTMLElement, items: RibbonItem[]): void {
    const settings = this.getSettings();
    const byId = new Map(items.map((i) => [i.id, i]));
    const blocks = layout(settings, items.filter((i) => i.el).map((i) => i.id));
    const titles: HTMLElement[] = [];

    for (const block of blocks) {
      const wrapper = container.createDiv({
        cls: block.kind === 'group' ? `${GROUP_CLASS} is-group` : `${GROUP_CLASS} is-loose`,
      });
      this.ownedEls.push(wrapper);
      // A hidden block still holds its buttons; see the comment on LayoutBlock.
      wrapper.toggleClass('is-hidden', block.hidden);
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
          icon.addEventListener('click', () => this.on.setCollapsed(group.id, !group.collapsed));
          this.bindMenu(icon, group);
        }

        if (group.showTitle) {
          // The full title stays on aria-label: the drawn label is cut to what
          // the ribbon can show, and the tooltip is where the rest lives.
          const title = wrapper.createDiv({ cls: 'ribbon-groups-title', text: titleLabel(group.title) });
          title.setAttribute('aria-label', group.title);
          title.addEventListener('click', () => this.on.setCollapsed(group.id, !group.collapsed));
          this.bindMenu(title, group);
          titles.push(title);
        }
      }

      const slot = wrapper.createDiv({ cls: 'ribbon-groups-items' });
      for (const id of block.itemIds) {
        const el = byId.get(id)?.el;
        if (!el) continue;
        // appendChild moves the node out of wherever it was, which is the point
        slot.appendChild(el);
        this.itemIds.set(el, id);
      }
    }

    // After every wrapper is in the document, so the measurements are real.
    for (const title of titles) fitTitle(title);
  }

  /**
   * The right-click menu on a group's title or icon.
   *
   * Everything here is reachable from the settings pane too. The point is that
   * the ribbon is where you notice you want it: a group in the way, or one you
   * want to rename. Making the user find Settings → Community plugins → this
   * plugin first is three clicks to reach a two-click job.
   */
  private bindMenu(el: HTMLElement, group: RibbonGroup): void {
    el.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const menu = new Menu();

      menu.addItem((item) =>
        item
          .setTitle(group.collapsed ? t.menuExpand : t.menuCollapse)
          .setIcon(group.collapsed ? 'chevron-down' : 'chevron-right')
          .onClick(() => this.on.setCollapsed(group.id, !group.collapsed))
      );

      menu.addItem((item) =>
        item
          .setTitle(t.menuHideGroup)
          .setIcon('eye-off')
          .onClick(() => this.on.setHidden(group.id, true))
      );

      menu.addSeparator();

      menu.addItem((item) => item.setTitle(t.menuSettings).setIcon('settings').onClick(() => this.on.openSettings()));

      menu.showAtMouseEvent(event);
    });
  }

  /**
   * The blocks currently on the ribbon, top to bottom.
   *
   * Read back out of the DOM rather than kept as a field: `render()` is not the
   * only thing that changes the ribbon, and a cached list would let a drag aim
   * at a block that is no longer there.
   */
  private blocks(): RibbonBlockRef[] {
    const container = this.container;
    if (!container) return [];

    const out: RibbonBlockRef[] = [];
    for (const child of Array.from(container.children)) {
      if (!(child instanceof HTMLElement) || !child.hasClass(GROUP_CLASS)) continue;
      // A hidden block measures as a zero-size rect at the top of the document,
      // which would put it within snapping distance of a drop near y=0.
      if (child.hasClass('is-hidden')) continue;
      const slot = child.querySelector<HTMLElement>('.ribbon-groups-items');
      if (!slot) continue;
      out.push({
        groupId: child.dataset.groupId ?? null,
        wrapper: child,
        slot,
        collapsed: child.hasClass('is-collapsed'),
      });
    }
    return out;
  }

  /**
   * Add the temporary area a button can be dropped on to leave its group.
   *
   * Only needed while every button is grouped: there is no ungrouped block on
   * screen then, and without one "drag it out" has no target. It goes wherever
   * the real ungrouped block would go, so the gesture and the result agree.
   */
  private addPlaceholder(): HTMLElement | null {
    const container = this.container;
    if (!container) return null;

    const wrapper = createDiv({ cls: `${GROUP_CLASS} is-loose ${PLACEHOLDER_CLASS}` });
    wrapper.createDiv({ cls: 'ribbon-groups-items' });
    if (this.getSettings().ungrouped === 'top') container.prepend(wrapper);
    else container.appendChild(wrapper);
    return wrapper;
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

/**
 * Shrink a group label until it stops clipping.
 *
 * There is no CSS for "make this text as large as still fits", and the width
 * available is fixed by Obsidian at roughly 24px, so the size is stepped down
 * and re-measured. Six or seven passes on a handful of labels is not a cost
 * worth optimising away, and doing it any other way means guessing at the
 * theme's font metrics.
 *
 * A ribbon that is not on screen measures as zero wide. Leaving the base size
 * alone is the right answer there — `apply()` runs again when the pane is next
 * touched, and by then the measurement is real.
 */
function fitTitle(el: HTMLElement): void {
  el.style.removeProperty('--rg-title-size');
  if (el.clientWidth <= 0) return;

  for (let size = TITLE_SIZE_PX; size >= TITLE_MIN_SIZE_PX; size -= TITLE_STEP_PX) {
    el.style.setProperty('--rg-title-size', `${size}px`);
    if (el.scrollWidth <= el.clientWidth) return;
  }
}
