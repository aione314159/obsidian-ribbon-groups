/**
 * Ribbon Groups — group the buttons in the left ribbon.
 *
 * This plugin rearranges Obsidian's own UI rather than a window of its own,
 * which imposes one rule: **after it is disabled the ribbon must look as if it
 * had never been installed**. That logic is `RibbonManager.stop()`; read it
 * before changing anything that touches the DOM.
 */

import './styles.css';

import { Plugin } from 'obsidian';
import { normalizeSettings, setAllCollapsed, updateGroup } from './groupLayout';
import { t } from './i18n';
import { RibbonManager } from './ribbonManager';
import { RibbonGroupsSettingTab } from './settingsTab';
import { DEFAULT_SETTINGS, type RibbonGroupsSettings } from './types';

export default class RibbonGroupsPlugin extends Plugin {
  settings: RibbonGroupsSettings = { ...DEFAULT_SETTINGS };
  manager!: RibbonManager;

  /** Counter behind group ids; unique within one session. */
  private seed = 0;

  async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());

    this.manager = new RibbonManager(
      this.app,
      () => this.settings,
      (groupId, collapsed) => void this.setCollapsed(groupId, collapsed)
    );

    this.addSettingTab(new RibbonGroupsSettingTab(this.app, this));

    // The ribbon is only complete once every plugin has loaded. Taking over
    // earlier catches half a list; the MutationObserver would pick up the rest,
    // but the user would see the layout jump first.
    this.app.workspace.onLayoutReady(() => this.manager.start());

    this.addCommand({
      id: 'reapply',
      name: t.cmdReapply,
      callback: () => this.manager.apply(),
    });

    // Collapsing is otherwise one click per group, which is the whole ribbon's
    // worth of clicks on a small screen — the case the feature exists for.
    this.addCommand({
      id: 'collapse-all',
      name: t.cmdCollapseAll,
      callback: () => void this.setAllCollapsed(true),
    });

    this.addCommand({
      id: 'expand-all',
      name: t.cmdExpandAll,
      callback: () => void this.setAllCollapsed(false),
    });
  }

  onunload(): void {
    this.manager?.stop();
  }

  /** Save and apply at once. Every settings change goes through here. */
  async persist(): Promise<void> {
    await this.saveData(this.settings);
    this.manager.apply();
  }

  nextSeed(): string {
    this.seed += 1;
    return `${Date.now().toString(36)}-${this.seed}`;
  }

  private async setCollapsed(groupId: string, collapsed: boolean): Promise<void> {
    this.settings = updateGroup(this.settings, groupId, { collapsed });
    await this.persist();
  }

  private async setAllCollapsed(collapsed: boolean): Promise<void> {
    this.settings = setAllCollapsed(this.settings, collapsed);
    await this.persist();
  }
}
