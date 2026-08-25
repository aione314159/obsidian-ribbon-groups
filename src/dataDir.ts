/**
 * The "storage location" row.
 *
 * The settings file lives where Obsidian puts it
 * (`.obsidian/plugins/<id>/data.json`). This does not relocate it and does not
 * let the user pick a path: Obsidian's own loadData/saveData would keep reading
 * and writing the original location, and the two would drift apart. The row
 * does two things only — show where the file actually is, and offer a button to
 * open the folder.
 */

import { App, FileSystemAdapter, Notice, Setting } from 'obsidian';
import { t } from './i18n';

/** Absolute path of the plugin folder; null on mobile, which has no local FS. */
export function pluginDataDir(app: App, pluginId: string): string | null {
  const adapter = app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) return null;
  return `${adapter.getBasePath()}/${app.vault.configDir}/plugins/${pluginId}`;
}

/** Open a folder in the system file manager. */
function openFolder(dir: string): void {
  try {
    // Obsidian desktop runs in Electron, but this module is also loaded on
    // mobile, so it cannot be imported at the top of the file. Resolve it
    // through window.require only at the moment the folder is opened.
    const electron = (window as unknown as { require?: (m: string) => unknown }).require?.('electron');
    const shell = (electron as { shell?: { openPath?: (p: string) => Promise<string> } } | undefined)?.shell;
    if (!shell?.openPath) throw new Error('electron.shell is unavailable');
    void shell.openPath(dir);
  } catch (e) {
    new Notice(t.dataDirOpenFailed(dir));
    console.error('[ribbon-groups] failed to open folder', e);
  }
}

/**
 * Add the "storage location" row to the settings pane.
 * The path sits in the description where it can be selected and copied; the
 * open button is on the right.
 */
export function addDataDirSetting(containerEl: HTMLElement, app: App, pluginId: string): void {
  const dir = pluginDataDir(app, pluginId);
  const setting = new Setting(containerEl).setName(t.dataDirName);

  if (!dir) {
    setting.setDesc(t.dataDirUnavailable);
    return;
  }

  setting.setDesc(t.dataDirDesc);
  setting.descEl.createDiv({ cls: 'ribbon-groups-path', text: dir });
  setting.addButton((b) =>
    b
      .setButtonText(t.dataDirOpen)
      .setTooltip(t.dataDirOpenTooltip)
      .onClick(() => openFolder(dir))
  );
}
