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

import { App, PluginSettingTab, Setting, Notice, getIconIds, setIcon } from 'obsidian';
import { addBackupSection } from './backupSettings';
import { addDataDirSetting } from './dataDir';
import { measureZone, PointerDragController, type ZoneRef } from './dragController';
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
    addBackupSection(containerEl, {
      read: () => this.plugin.settings,
      replace: async (next) => {
        this.plugin.settings = next;
        await this.plugin.persist();
        this.display();
      },
    });
    addDataDirSetting(containerEl, this.app, this.plugin.manifest.id);
    this.renderDiagnostics(probe.diagnostics);
  }

  hide(): void {
    this.drag.cancel();
  }

  // --- Sections ---

  /**
   * When detection fails, do not pretend anything works.
   *
   * The ribbon's internals have no public API and a release can move them.
   * Rather than a settings pane that looks fine but ignores every drag, show
   * what was detected so the user can paste it into a report.
   */
  private renderProbeFailure(diagnostics: string[]): void {
    new Setting(this.containerEl).setName(t.ribbonMissingHeading).setHeading();

    this.containerEl.createEl('p', { cls: 'ribbon-groups-warning', text: t.ribbonMissingDesc });

    const pre = this.containerEl.createEl('pre', { cls: 'ribbon-groups-diagnostics' });
    pre.createEl('code', { text: diagnostics.join('\n') });

    new Setting(this.containerEl).addButton((b) =>
      b.setButtonText(t.copyDiagnostics).onClick(() => {
        void navigator.clipboard.writeText(diagnostics.join('\n'));
        new Notice(t.copied);
      })
    );
  }

  private renderGeneral(allIds: string[]): void {
    new Setting(this.containerEl).setName(t.general).setHeading();

    new Setting(this.containerEl)
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
            this.display();
          })
      );

    new Setting(this.containerEl)
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
      new Setting(this.containerEl)
        .setName(t.missingCount(missing.length))
        .setDesc(t.missingDesc)
        .addButton((b) =>
          b.setButtonText(t.clear).onClick(async () => {
            this.plugin.settings = pruneMissing(this.plugin.settings, allIds);
            await this.plugin.persist();
            this.display();
          })
        );
    }
  }

  private renderGroups(items: RibbonItem[], allIds: string[]): void {
    new Setting(this.containerEl).setName(t.groups).setHeading();

    const list = this.containerEl.createDiv({ cls: 'ribbon-groups-list' });
    this.groupListEl = list;

    this.plugin.settings.groups.forEach((group) => {
      const card = list.createDiv({ cls: 'ribbon-groups-card' });
      card.dataset.groupId = group.id;

      // The whole card moves, but only the handle starts the gesture — otherwise
      // selecting text in the title field would drag the group.
      const header = card.createDiv({ cls: 'ribbon-groups-card-header' });
      const handle = header.createDiv({ cls: 'ribbon-groups-handle', text: '⠿' });
      handle.setAttribute('aria-label', t.dragToReorder);
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

      new Setting(card).addButton((b) =>
        b.setButtonText(t.deleteGroup).onClick(async () => {
          // The group's buttons go back to the ungrouped area, they do not vanish
          this.plugin.settings = removeGroup(this.plugin.settings, group.id);
          await this.plugin.persist();
          this.display();
        })
      );
    });

    new Setting(this.containerEl).addButton((b) =>
      b
        .setButtonText(t.addGroup)
        .setCta()
        .onClick(async () => {
          const seed = `${this.plugin.settings.groups.length}-${allIds.length}-${this.plugin.nextSeed()}`;
          this.plugin.settings.groups.push(createGroup(t.newGroupName, seed));
          await this.plugin.persist();
          this.display();
        })
    );
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
        this.display();
      });
    }
  }

  private renderUngrouped(items: RibbonItem[], allIds: string[]): void {
    new Setting(this.containerEl).setName(t.ungrouped).setHeading();

    // The filter only touches this list. Groups hold a handful of buttons each,
    // whereas a well-populated vault leaves dozens sitting here. Filtering
    // cannot disturb drag indices either: order in the ungrouped area comes
    // from Obsidian, so moveItem() ignores the index when the target is null.
    const search = new Setting(this.containerEl);
    search.settingEl.addClass('ribbon-groups-search');

    const slot = this.containerEl.createDiv({ cls: 'ribbon-groups-slot is-loose' });
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

  private renderDiagnostics(diagnostics: string[]): void {
    const details = this.containerEl.createEl('details', { cls: 'ribbon-groups-details' });
    details.createEl('summary', { text: t.diagnostics });
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

      // The whole row is the handle. There is nothing else in it to interact
      // with, and a small grip is hard to hit on a touch screen.
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

  private async commitItemMove(itemId: string, target: DropTarget): Promise<void> {
    this.plugin.settings = moveItem(this.plugin.settings, itemId, target.groupId, target.index);
    await this.plugin.persist();
    this.display();
  }

  private async commitGroupMove(groupId: string, target: DropTarget): Promise<void> {
    this.plugin.settings = moveGroup(this.plugin.settings, groupId, target.index);
    await this.plugin.persist();
    this.display();
  }

  /** Patch one group and reapply, without redrawing the pane. */
  private async patchGroup(groupId: string, patch: Parameters<typeof updateGroup>[2]): Promise<void> {
    this.plugin.settings = updateGroup(this.plugin.settings, groupId, patch);
    await this.plugin.persist();
  }
}
