/**
 * Data model.
 *
 * A group stores nothing but an ordered list of button ids. Titles, icons and
 * owning plugins all come from Obsidian at runtime; caching them here would
 * only go stale the moment another plugin is renamed or updated.
 */

/** One button on the ribbon, as reported by Obsidian. */
export interface RibbonItem {
  /** Obsidian's internal identifier, shaped like `plugin-id:command-name`. */
  id: string;
  /** Display name, so the settings pane can show which button is which. */
  title: string;
  /** The matching DOM node, or null when it could not be resolved. */
  el: HTMLElement | null;
}

export interface RibbonGroup {
  /** Internal id, stable once created; drag and settings both key off it. */
  id: string;
  title: string;
  /**
   * Background colour. An empty string means no fill, just a separator.
   * Stored as a literal CSS colour rather than a theme variable name, because
   * what the user picks from the swatches is an actual colour.
   */
  color: string;
  /**
   * Lucide icon name shown above the group, or an empty string for none.
   *
   * The ribbon is roughly 42px wide, so a title longer than two or three
   * characters is truncated. An icon says the same thing in the space that is
   * actually available.
   */
  icon: string;
  /** Whether to show the title above the group. */
  showTitle: boolean;
  /** Collapsed groups keep their title row and hide their buttons. */
  collapsed: boolean;
  /** Button ids in the group; the order here is the order on screen. */
  itemIds: string[];
}

export interface RibbonGroupsSettings {
  groups: RibbonGroup[];
  /** Whether ungrouped buttons sit above or below every group. */
  ungrouped: 'top' | 'bottom';
  /**
   * Whether to keep ids that no longer match a button.
   *
   * Kept by default: a plugin may only be disabled temporarily, and dropping
   * its ids would send those buttons back to the ungrouped area on re-enable,
   * losing wherever the user had placed them.
   */
  keepMissing: boolean;
  /**
   * Tighter vertical spacing on the ribbon.
   *
   * With many groups the default padding pushes the last buttons off the
   * bottom of a short window; compact mode trades breathing room for fitting.
   */
  compact: boolean;
}

/** One rendered section of the ribbon. */
export type LayoutBlock =
  | { kind: 'group'; group: RibbonGroup; itemIds: string[] }
  | { kind: 'ungrouped'; itemIds: string[] };

export const DEFAULT_SETTINGS: RibbonGroupsSettings = {
  groups: [],
  ungrouped: 'bottom',
  keepMissing: true,
  compact: false,
};
