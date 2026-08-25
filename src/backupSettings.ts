/**
 * Export and import of the whole settings object.
 *
 * Groups are hand-built and easy to lose: a second vault starts empty, and a
 * reset throws the arrangement away with no undo. This section is the escape
 * hatch — copy the JSON out, paste it back in somewhere else.
 *
 * Import is the one path where arbitrary text becomes settings, so it never
 * assigns what it parsed. `parseSettingsJson()` runs the same normalisation as
 * a load from disk, which is what keeps the one-button-one-group rule from
 * being bypassed by a hand-edited file.
 */

import { Notice, Setting } from 'obsidian';
import { parseSettingsJson, serializeSettings } from './groupLayout';
import { t } from './i18n';
import type { RibbonGroupsSettings } from './types';

export interface BackupHost {
  read: () => RibbonGroupsSettings;
  /** Replaces the settings wholesale and redraws. */
  replace: (next: RibbonGroupsSettings) => Promise<void>;
}

export function addBackupSection(containerEl: HTMLElement, host: BackupHost): void {
  new Setting(containerEl).setName(t.backup).setHeading();

  const box = containerEl.createEl('textarea', {
    cls: 'ribbon-groups-backup-box',
    attr: { rows: '4', placeholder: t.importPlaceholder, spellcheck: 'false' },
  });

  new Setting(containerEl)
    .setDesc(t.backupDesc)
    .addButton((b) =>
      b.setButtonText(t.exportSettings).onClick(() => {
        const text = serializeSettings(host.read());
        box.value = text;
        void navigator.clipboard.writeText(text);
        new Notice(t.exportCopied);
      })
    )
    .addButton((b) =>
      b.setButtonText(t.importSettings).setWarning().onClick(async () => {
        const parsed = parseSettingsJson(box.value);
        if (!parsed) {
          new Notice(t.importFailed);
          return;
        }
        await host.replace(parsed);
        new Notice(t.importDone(parsed.groups.length));
      })
    );
}
