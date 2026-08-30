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

/**
 * The heading is the caller's job.
 *
 * This section is drawn inside a card whose head already names it, so a heading
 * of its own would print "Backup" twice in a row — which reads as a rendering
 * bug rather than a section. The same goes for the blurb: the card's subtitle
 * says what this is for, so the row only carries its two buttons.
 */
export function addBackupSection(containerEl: HTMLElement, host: BackupHost): void {
  // The textarea sits in a wrapper rather than carrying the card's gutter
  // itself. A textarea is a replaced element: `width: auto` does not stretch it
  // the way it stretches a div, so it has to be `width: 100%` — and padding on
  // the box then insets its text while its border still runs the full width of
  // the card. The wrapper takes the gutter, the box fills what is left.
  const row = containerEl.createDiv({ cls: 'ribbon-groups-backup-row' });
  const box = row.createEl('textarea', {
    cls: 'ribbon-groups-backup-box',
    attr: { rows: '4', placeholder: t.importPlaceholder, spellcheck: 'false' },
  });

  new Setting(containerEl)
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
