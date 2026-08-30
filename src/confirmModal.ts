/**
 * A yes/no gate in front of anything that throws work away.
 *
 * Adapted from the shared Obsidian plugin kit, so that a confirmation in this
 * plugin behaves like a confirmation in every other one. Four things are
 * deliberate, because they were the four that had drifted apart:
 *
 * 1. There is a title. A bare sentence in a box does not say what is about to
 *    happen to what.
 * 2. Cancel sits on the left, the destructive action on the right — one order,
 *    everywhere. A dialog whose buttons swap sides between plugins trains the
 *    user to click by position and then punishes them for it.
 * 3. Focus starts on Cancel. Return on a dialog you did not read should do
 *    nothing, not delete.
 * 4. close() runs before onConfirm(). The callback may show a Notice or redraw
 *    the pane, and Obsidian does not stack that cleanly on a closing modal.
 *
 * Labels come in as strings rather than being read from `i18n.ts` here: the
 * message is different at every call site, and passing all of it in keeps this
 * file free of anything to translate.
 */

import { App, Modal, Setting } from 'obsidian';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirm: string;
  cancel: string;
}

export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private readonly options: ConfirmOptions,
    private readonly onConfirm: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('ribbon-groups-confirm');
    contentEl.createEl('h2', { text: this.options.title });
    contentEl.createEl('p', { text: this.options.message });

    // Obsidian's own Setting row, so the buttons match the rest of the app
    // rather than being bare <button> elements with our own spacing.
    const actions = new Setting(contentEl);
    actions.settingEl.addClass('ribbon-groups-confirm-actions');

    const buttons: HTMLButtonElement[] = [];
    actions.addButton((b) => {
      buttons.push(b.buttonEl);
      b.setButtonText(this.options.cancel).onClick(() => this.close());
    });
    actions.addButton((b) =>
      b
        .setButtonText(this.options.confirm)
        .setWarning()
        .onClick(() => {
          this.close();
          this.onConfirm();
        })
    );

    // Return on a dialog nobody read must do nothing, not delete
    buttons[0]?.focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
