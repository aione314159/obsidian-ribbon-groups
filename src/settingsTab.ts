/**
 * The settings pane.
 *
 * Groups and buttons are both arranged by dragging, so the user never has to
 * know an internal id — the pane lists whatever is on the ribbon right now.
 *
 * Every change saves and reapplies immediately. A two-step "edit then apply"
 * would buy nothing here: what is being adjusted is colour and order, and the
 * point is to see the result.
 *
 * Dragging goes through `PointerDragController`, not the HTML5 drag-and-drop
 * API. See that file for why.
 */

import { App, PluginSettingTab, Setting, Notice, getIconIds, setIcon, ToggleComponent } from 'obsidian';
import { addBackupSection } from './backupSettings';
import { ConfirmModal } from './confirmModal';
import { addDataDirSetting } from './dataDir';
import { findScroller, measureZone, PointerDragController, type ZoneRef } from './dragController';
import { t } from './i18n';
import {
  createGroup,
  matchesQuery,
  missingIds,
  moveGroup,
  moveItem,
  pruneMissing,
  removeGroup,
  ungroupedIds,
  updateGroup,
} from './groupLayout';
import type RibbonGroupsPlugin from './main';
import type { DropTarget } from './dragList';
import type { RibbonItem } from './types';

/** Built-in swatches. Taken from Obsidian's accent range so both themes work. */
const SWATCHES: { label: string; value: string }[] = [
  { label: t.swatchNone, value: '' },
  { label: t.swatchRed, value: 'rgba(233, 105, 105, 0.18)' },
  { label: t.swatchOrange, value: 'rgba(233, 151, 63, 0.18)' },
  { label: t.swatchYellow, value: 'rgba(224, 222, 113, 0.20)' },
  { label: t.swatchGreen, value: 'rgba(104, 190, 118, 0.18)' },
  { label: t.swatchCyan, value: 'rgba(83, 189, 197, 0.18)' },
  { label: t.swatchBlue, value: 'rgba(107, 149, 226, 0.20)' },
  { label: t.swatchPurple, value: 'rgba(168, 130, 220, 0.20)' },
];

const ITEM_SELECTOR = '.ribbon-groups-item';
const CARD_SELECTOR = ':scope > .ribbon-groups-card';

/** A drop area for buttons: a group's list, or the ungrouped list. */
interface SlotRef {
  el: HTMLElement;
  groupId: string | null;
}

/**
 * Whether Obsidian knows this icon name.
 *
 * `setIcon()` draws nothing for an unknown name, which would leave the user
 * staring at an empty group header with no idea why. `getIconIds()` returns
 * prefixed ids such as `lucide-folder-open`, while `setIcon()` accepts both
 * forms, so check both.
 */
function isKnownIcon(name: string): boolean {
  if (!name) return true;
  const ids = getIconIds();
  return ids.includes(name) || ids.includes(`lucide-${name}`);
}

export class RibbonGroupsSettingTab extends PluginSettingTab {
  private readonly drag = new PointerDragController();
  /** Rebuilt on every display(); measured fresh at the start of each gesture. */
  private itemSlots: SlotRef[] = [];
  private groupListEl: HTMLElement | null = null;
  /** Filter for the ungrouped list. Survives a redraw so typing is not interrupted. */
  private query = '';

  constructor(app: App, private readonly plugin: RibbonGroupsPlugin) {
    super(app, plugin);
  }

  display(): void {
    // A drag in progress points at elements that are about to be discarded.
    this.drag.cancel();

    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('ribbon-groups-settings');
    this.itemSlots = [];
    this.groupListEl = null;

    this.renderHero();

    const probe = this.plugin.manager.probe();
    const items = probe.items.filter((i) => i.el);
    const allIds = items.map((i) => i.id);

    if (!probe.ok) {
      this.renderProbeFailure(probe.diagnostics);
      return;
    }

    this.renderGeneral(allIds);
    this.renderGroups(items, allIds);
    this.renderUngrouped(items, allIds);
    this.renderBackup();
    this.renderDataDir();
    this.renderDiagnostics(probe.diagnostics);
  }

  hide(): void {
    this.drag.cancel();
  }

  /**
   * Rebuild the pane in place, without losing the reader's position.
   *
   * Every change here saves and redraws, and `display()` empties the container
   * to do it — which resets the scroll to the top. Reordering a button forty
   * rows down would throw the user back to the first setting every single time,
   * and the list they were working in is off screen again.
   *
   * The scroll container is Obsidian's, not ours, so it is looked up rather
   * than assumed: the settings pane is a modal on desktop and a full-screen
   * view on mobile, and the element that scrolls is not the same one.
   */
  private redraw(): void {
    const scroller = this.scroller();
    const top = scroller?.scrollTop ?? 0;
    this.display();
    // The rebuild is synchronous, so the new content is already laid out and a
    // scrollTop past the new height clamps itself.
    if (scroller) scroller.scrollTop = top;
  }

  /**
   * The element that actually scrolls.
   *
   * Measured over CDP on Obsidian 1.13.7: it is `containerEl` itself —
   * `.vertical-tab-content`, which carries `overflow-y: auto`. Every ancestor
   * up to `<html>` is `hidden` or `clip`. Walking straight to the parent, the
   * way an edge-scroll lookup does, finds nothing and the restore is silently a
   * no-op — the pane still jumps to the top and the fix looks applied.
   */
  private scroller(): HTMLElement | null {
    const el = this.containerEl;
    const overflow = getComputedStyle(el).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return el;
    return findScroller(el);
  }

  // --- Sections ---

  /** Plugin name, tagline, and running version, above every section card. */
  private renderHero(): void {
    const hero = this.containerEl.createDiv({ cls: 'ribbon-groups-hero' });
    setIcon(hero.createDiv({ cls: 'ribbon-groups-hero-mark' }), 'layout-grid');
    const text = hero.createDiv();
    text.createDiv({ cls: 'ribbon-groups-hero-title', text: this.plugin.manifest.name });
    text.createDiv({
      cls: 'ribbon-groups-hero-subtitle',
      text: t.heroSubtitle(this.plugin.manifest.version),
    });
  }

  /** One section card: icon + title + subtitle in the head, `Setting` rows attach to the returned body. */
  private card(icon: string, title: string, subtitle: string): HTMLElement {
    const section = this.containerEl.createDiv({ cls: 'ribbon-groups-section' });
    const head = section.createDiv({ cls: 'ribbon-groups-section-head' });
    setIcon(head.createDiv({ cls: 'ribbon-groups-section-icon' }), icon);
    const text = head.createDiv();
    text.createDiv({ cls: 'ribbon-groups-section-title', text: title });
    text.createDiv({ cls: 'ribbon-groups-section-subtitle', text: subtitle });
    return section.createDiv({ cls: 'ribbon-groups-section-body' });
  }

  /**
   * When detection fails, do not pretend anything works.
   *
   * The ribbon's internals have no public API and a release can move them.
   * Rather than a settings pane that looks fine but ignores every drag, show
   * what was detected so the user can paste it into a report.
   */
  private renderProbeFailure(diagnostics: string[]): void {
    const body = this.card('bug', t.ribbonMissingHeading, t.ribbonMissingSubtitle);

    body.createEl('p', { cls: 'ribbon-groups-warning', text: t.ribbonMissingDesc });

    const pre = body.createEl('pre', { cls: 'ribbon-groups-diagnostics' });
    pre.createEl('code', { text: diagnostics.join('\n') });

    const actions = body.createDiv({ cls: 'ribbon-groups-actions' });
    const copyBtn = actions.createEl('button', { cls: 'mod-cta', text: t.copyDiagnostics });
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard.writeText(diagnostics.join('\n'));
      new Notice(t.copied);
    });
  }

  private renderGeneral(allIds: string[]): void {
    const body = this.card('sliders-horizontal', t.general, t.generalSubtitle);

    new Setting(body)
      .setName(t.ungroupedPosition)
      .setDesc(t.ungroupedPositionDesc)
      .addDropdown((d) =>
        d
          .addOption('top', t.positionTop)
          .addOption('bottom', t.positionBottom)
          .setValue(this.plugin.settings.ungrouped)
          .onChange(async (v) => {
            this.plugin.settings.ungrouped = v === 'top' ? 'top' : 'bottom';
            await this.plugin.persist();
            this.redraw();
          })
      );

    new Setting(body)
      .setName(t.hideUngrouped)
      .setDesc(t.hideUngroupedDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.hideUngrouped).onChange(async (v) => {
          this.plugin.settings.hideUngrouped = v;
          await this.plugin.persist();
        })
      );

    new Setting(body)
      .setName(t.compact)
      .setDesc(t.compactDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.compact).onChange(async (v) => {
          this.plugin.settings.compact = v;
          await this.plugin.persist();
        })
      );

    const missing = missingIds(this.plugin.settings, allIds);
    if (missing.length > 0) {
      new Setting(body)
        .setName(t.missingCount(missing.length))
        .setDesc(t.missingDesc)
        .addButton((b) =>
          b.setButtonText(t.clear).onClick(async () => {
            this.plugin.settings = pruneMissing(this.plugin.settings, allIds);
            await this.plugin.persist();
            this.redraw();
          })
        );
    }
  }

  private renderGroups(items: RibbonItem[], allIds: string[]): void {
    const body = this.card('folder-tree', t.groups, t.groupsSubtitle);

    const list = body.createDiv({ cls: 'ribbon-groups-list' });
    this.groupListEl = list;

    this.plugin.settings.groups.forEach((group) => {
      const card = list.createDiv({ cls: 'ribbon-groups-card' });
      card.dataset.groupId = group.id;
      // The card wears the group's own colour, so the settings pane previews
      // what the ribbon will look like instead of describing it. The value is
      // the same validated literal the ribbon uses; see normalizeSettings().
      if (group.color) card.style.setProperty('--rg-card-color', group.color);
      card.toggleClass('has-color', Boolean(group.color));

      // The whole card moves, but only the handle starts the gesture — otherwise
      // selecting text in the title field would drag the group.
      const header = card.createDiv({ cls: 'ribbon-groups-card-header' });
      const handle = header.createDiv({ cls: 'ribbon-groups-handle', text: '⠿' });
      handle.setAttribute('aria-label', t.dragToReorder);

      // A toggle rather than a row of its own: whether a group is on the
      // ribbon belongs next to its name, and the card is already tall. Uses
      // Obsidian's own ToggleComponent (small variant) so it matches every
      // other on/off control in this pane instead of a bare native checkbox.
      const visible = new ToggleComponent(header);
      // 'mod-small' matches Obsidian's own compact toggle size (--toggle-s-*);
      // ToggleComponent.setSmall() adds the same class but is not public API.
      visible.toggleEl.addClass('ribbon-groups-visible', 'mod-small');
      visible.setTooltip(t.groupVisible);
      visible.toggleEl.setAttribute('aria-label', t.groupVisible);
      visible.setValue(!group.hidden);
      visible.onChange((v) => {
        card.toggleClass('is-group-hidden', !v);
        void this.patchGroup(group.id, { hidden: !v });
      });
      card.toggleClass('is-group-hidden', group.hidden);
      this.drag.bind(handle, {
        source: card,
        fromGroupId: null,
        measure: () => this.measureGroupZones(),
        commit: (target) => void this.commitGroupMove(group.id, target),
      });

      const titleInput = header.createEl('input', {
        cls: 'ribbon-groups-title-input',
        attr: { type: 'text', placeholder: t.groupNamePlaceholder, value: group.title },
      });
      titleInput.addEventListener('change', () => {
        void this.patchGroup(group.id, { title: titleInput.value });
      });

      new Setting(card)
        .setName(t.showTitle)
        .setDesc(t.showTitleDesc)
        .addToggle((toggle) =>
          toggle.setValue(group.showTitle).onChange((v) => void this.patchGroup(group.id, { showTitle: v }))
        );

      this.renderIconField(card, group.id, group.icon);
      this.renderSwatches(card, group.id, group.color);

      const slot = card.createDiv({ cls: 'ribbon-groups-slot' });
      this.itemSlots.push({ el: slot, groupId: group.id });
      this.renderItems(slot, group.id, group.itemIds, items);

      // A plain button, not `new Setting(card).addButton(...)`: a Setting with
      // no name or description still lays out an empty `.setting-item-info`
      // column, which silently claims about half the row's width and leaves
      // the button off-centre in the remainder instead of flush with the edge.
      const actions = card.createDiv({ cls: 'ribbon-groups-actions' });
      const deleteBtn = actions.createEl('button', { cls: 'mod-warning', text: t.deleteGroup });
      deleteBtn.addEventListener('click', () => {
        // Deleting is the one action here that cannot be undone by repeating
        // it: colours and order can be put back by hand, a group's membership
        // list cannot. Everything else in this pane applies immediately with no
        // prompt, so this is the only dialog and it stays that way.
        new ConfirmModal(
          this.app,
          {
            title: t.deleteGroupTitle,
            message: t.deleteGroupConfirm(group.title || t.newGroupName),
            confirm: t.deleteGroup,
            cancel: t.cancel,
          },
          async () => {
            // The group's buttons go back to the ungrouped area, they do not vanish
            this.plugin.settings = removeGroup(this.plugin.settings, group.id);
            await this.plugin.persist();
            this.redraw();
          }
        ).open();
      });
    });

    // A plain button, not `new Setting(body).addButton(...)`: a Setting with no
    // name or description still lays out an empty `.setting-item-info` column,
    // which silently claims about half the row's width (same reasoning as the
    // delete-button row above, inside the forEach).
    const actions = body.createDiv({ cls: 'ribbon-groups-actions' });
    const addBtn = actions.createEl('button', { cls: 'mod-cta', text: t.addGroup });
    addBtn.addEventListener('click', async () => {
      const seed = `${this.plugin.settings.groups.length}-${allIds.length}-${this.plugin.nextSeed()}`;
      this.plugin.settings.groups.push(createGroup(t.newGroupName, seed));
      await this.plugin.persist();
      this.redraw();
    });
  }

  /**
   * The icon field.
   *
   * A free-text Lucide name rather than a picker: the icon list runs to well
   * over a thousand entries, and a grid of them would dwarf the rest of the
   * pane. The live preview and the unknown-name warning together make typing
   * one about as fast, without the payload.
   */
  private renderIconField(card: HTMLElement, groupId: string, current: string): void {
    const setting = new Setting(card).setName(t.groupIcon).setDesc(t.groupIconDesc);

    const preview = setting.controlEl.createDiv({ cls: 'ribbon-groups-icon-preview' });
    const warning = setting.descEl.createDiv({ cls: 'ribbon-groups-field-warning' });

    const paint = (name: string): void => {
      preview.empty();
      const known = isKnownIcon(name);
      if (name && known) setIcon(preview, name);
      warning.setText(name && !known ? t.groupIconInvalid : '');
    };

    setting.addText((text) =>
      text
        .setPlaceholder(t.groupIconPlaceholder)
        .setValue(current)
        .onChange((value) => {
          const name = value.trim();
          paint(name);
          // Only a name that resolves is stored; a typo would otherwise be saved
          // as an invisible group header.
          if (!name || isKnownIcon(name)) void this.patchGroup(groupId, { icon: name });
        })
    );

    paint(current);
  }

  private renderSwatches(parent: HTMLElement, groupId: string, current: string): void {
    const setting = new Setting(parent).setName(t.backgroundColor);
    // Eight swatches need more than the card's shared control column gives, so
    // this one row widens it. Without this they wrap onto a second line at the
    // default pane width, which reads as a layout bug rather than a choice.
    setting.settingEl.addClass('ribbon-groups-color-row');
    const row = setting.controlEl.createDiv({ cls: 'ribbon-groups-swatches' });

    for (const swatch of SWATCHES) {
      const dot = row.createDiv({ cls: 'ribbon-groups-swatch' });
      dot.setAttribute('aria-label', swatch.label);
      dot.toggleClass('is-none', swatch.value === '');
      dot.toggleClass('is-current', swatch.value === current);
      if (swatch.value) dot.style.background = swatch.value;
      dot.addEventListener('click', async () => {
        this.plugin.settings = updateGroup(this.plugin.settings, groupId, { color: swatch.value });
        await this.plugin.persist();
        this.redraw();
      });
    }
  }

  private renderUngrouped(items: RibbonItem[], allIds: string[]): void {
    const body = this.card('list', t.ungrouped, t.ungroupedSubtitle);

    // The filter only touches this list. Groups hold a handful of buttons each,
    // whereas a well-populated vault leaves dozens sitting here. Filtering
    // cannot disturb drag indices either: order in the ungrouped area comes
    // from Obsidian, so moveItem() ignores the index when the target is null.
    // No name or description is set, so the row is marked stacked: otherwise
    // the empty info column would still claim its half of the shared control
    // column and leave the search box narrower than the card.
    const search = new Setting(body);
    search.settingEl.addClass('ribbon-groups-search', 'ribbon-groups-stacked');

    const slot = body.createDiv({ cls: 'ribbon-groups-slot is-loose' });
    const draw = (): void => this.renderItems(slot, null, ungroupedIds(this.plugin.settings, allIds), items);

    search.addSearch((s) =>
      s
        .setPlaceholder(t.searchPlaceholder)
        .setValue(this.query)
        .onChange((value) => {
          this.query = value;
          draw();
        })
    );

    this.itemSlots.push({ el: slot, groupId: null });
    draw();
  }

  private renderBackup(): void {
    const body = this.card('save', t.backup, t.backupSubtitle);
    addBackupSection(body, {
      read: () => this.plugin.settings,
      replace: async (next) => {
        this.plugin.settings = next;
        await this.plugin.persist();
        this.redraw();
      },
    });
    // addBackupSection() (src/backupSettings.ts, out of scope for this pane's
    // own styling) draws its own heading plus one row with two buttons. The
    // shared control column sized for a single control is too narrow for a
    // pair of buttons, so that row is marked stacked from the outside instead.
    body.querySelectorAll<HTMLElement>('.setting-item:not(.setting-item-heading)').forEach((row) => {
      row.addClass('ribbon-groups-stacked');
    });
  }

  private renderDataDir(): void {
    const body = this.card('hard-drive', t.dataDirName, t.dataDirSubtitle);
    addDataDirSetting(body, this.app, this.plugin.manifest.id);
  }

  private renderDiagnostics(diagnostics: string[]): void {
    const body = this.card('bug', t.diagnostics, t.diagnosticsSubtitle);
    const details = body.createEl('details', { cls: 'ribbon-groups-details' });
    details.createEl('summary', { text: t.diagnosticsToggle });
    const pre = details.createEl('pre', { cls: 'ribbon-groups-diagnostics' });
    pre.createEl('code', { text: diagnostics.join('\n') });
  }

  // --- Dragging ---

  /** Fill one drop area with rows. Called again on its own when the filter changes. */
  private renderItems(
    slot: HTMLElement,
    groupId: string | null,
    itemIds: string[],
    items: RibbonItem[]
  ): void {
    slot.empty();
    const byId = new Map(items.map((i) => [i.id, i]));
    const filtered = groupId === null ? itemIds.filter((id) => matchesQuery(byId.get(id)?.title ?? id, this.query)) : itemIds;

    if (filtered.length === 0) {
      const empty = itemIds.length > 0 ? t.searchNoMatch : t.dropHere;
      slot.createDiv({ cls: 'ribbon-groups-empty', text: empty });
      return;
    }

    for (const id of filtered) {
      const item = byId.get(id);
      const row = slot.createDiv({ cls: 'ribbon-groups-item' });
      row.dataset.itemId = id;
      row.setAttribute('aria-label', t.dragToMove);
      row.createSpan({ cls: 'ribbon-groups-item-handle', text: '⠿' });
      row.createSpan({ cls: 'ribbon-groups-item-title', text: item?.title ?? id });

      // A dropdown next to the drag handle, because dragging is not always the
      // easier gesture: with a dozen groups the target may be off screen, and a
      // list of names is faster than a drag that has to auto-scroll to get
      // there. Both write the same setting.
      const picker = row.createEl('select', { cls: 'dropdown ribbon-groups-item-group' });
      picker.setAttribute('aria-label', t.moveToGroup);
      picker.title = t.moveToGroup;
      for (const g of this.plugin.settings.groups) {
        picker.createEl('option', { value: g.id, text: g.title || t.newGroupName });
      }
      picker.createEl('option', { value: '', text: t.ungrouped });
      picker.value = groupId ?? '';
      // The row itself starts a drag on pointerdown; without this, opening the
      // dropdown would be read as the beginning of one.
      picker.addEventListener('pointerdown', (e) => e.stopPropagation());
      picker.addEventListener('change', () => void this.moveItemToGroup(id, picker.value || null));

      // The rest of the row is the handle. A small grip is hard to hit on a
      // touch screen, so everything but the dropdown starts the drag.
      this.drag.bind(row, {
        source: row,
        fromGroupId: groupId,
        measure: () => this.measureItemZones(),
        commit: (target) => void this.commitItemMove(id, target),
      });
    }
  }

  /** Measure every button drop area. Rows are read live, never cached. */
  private measureItemZones(): ZoneRef[] {
    return this.itemSlots.map(({ el, groupId }) =>
      measureZone(el, groupId, Array.from(el.querySelectorAll<HTMLElement>(ITEM_SELECTOR)))
    );
  }

  /**
   * Measure the group list as a single drop area.
   *
   * Reordering groups is the same problem as reordering buttons with only one
   * zone to land in, so it reuses the same machinery; `groupId: null` here is
   * just that zone's name, not the ungrouped area.
   */
  private measureGroupZones(): ZoneRef[] {
    const list = this.groupListEl;
    if (!list) return [];
    return [measureZone(list, null, Array.from(list.querySelectorAll<HTMLElement>(CARD_SELECTOR)))];
  }

  /**
   * Move a button to a group by name rather than by dragging.
   *
   * It lands at the end of the target group: the dropdown says which group, and
   * nothing about where inside it, so appending is the only answer that does
   * not invent a position the user did not choose. Reordering within a group is
   * what the drag is for.
   */
  private async moveItemToGroup(itemId: string, groupId: string | null): Promise<void> {
    const target = this.plugin.settings.groups.find((g) => g.id === groupId);
    this.plugin.settings = moveItem(this.plugin.settings, itemId, groupId, target ? target.itemIds.length : 0);
    await this.plugin.persist();
    this.redraw();
  }

  private async commitItemMove(itemId: string, target: DropTarget): Promise<void> {
    this.plugin.settings = moveItem(this.plugin.settings, itemId, target.groupId, target.index);
    await this.plugin.persist();
    this.redraw();
  }

  private async commitGroupMove(groupId: string, target: DropTarget): Promise<void> {
    this.plugin.settings = moveGroup(this.plugin.settings, groupId, target.index);
    await this.plugin.persist();
    this.redraw();
  }

  /** Patch one group and reapply, without redrawing the pane. */
  private async patchGroup(groupId: string, patch: Parameters<typeof updateGroup>[2]): Promise<void> {
    this.plugin.settings = updateGroup(this.plugin.settings, groupId, patch);
    await this.plugin.persist();
  }
}
