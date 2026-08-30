/**
 * Pure grouping logic.
 *
 * Nothing here touches the DOM or Obsidian, so all of it is testable. The
 * failures that actually hurt in this plugin are data failures — the same
 * button ending up in two groups, or a drag index that makes a button vanish —
 * so they are isolated here and pinned down by tests.
 */

import { DEFAULT_SETTINGS, type LayoutBlock, type RibbonGroup, type RibbonGroupsSettings } from './types';

/**
 * Characters allowed in a stored icon name.
 *
 * Icon names reach `setIcon()`, and can arrive from an imported settings file
 * rather than from the picker. Obsidian looks the name up in a table and draws
 * nothing when it misses, so a stray value cannot inject markup — but keeping
 * the stored value to the shape Lucide actually uses means a malformed import
 * is rejected at the door instead of becoming an invisible broken group.
 */
const ICON_NAME_PATTERN = /^[a-z0-9-]{1,64}$/;

/**
 * Colour values allowed in a group's background.
 *
 * The stored value is written straight into a custom property that the
 * stylesheet consumes as `background: var(--rg-color)`. That makes it a real
 * injection point once settings can arrive by import: a value of
 * `url(https://example.com/?leak)` would have the browser fetch that URL the
 * moment the group is drawn, turning a pasted settings blob into a beacon.
 *
 * The picker only ever produces `rgba(...)`, so restricting the stored value to
 * literal colour syntax — hex, rgb/rgba, hsl/hsla, or a bare colour keyword —
 * costs nothing and closes the hole. Anything with a function call in it that
 * is not one of those forms is dropped.
 */
const COLOR_PATTERN =
  /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/deg]+\)|[a-z]{3,20})$/i;

/**
 * How many characters of a group title the ribbon can show.
 *
 * The ribbon is 44px wide and its padding leaves a label roughly 24px. Five
 * characters is what fits once the font size is allowed to shrink (see
 * `fitTitle()` in `ribbonManager.ts`); beyond that the text has to be cut, and
 * a silent cut reads as a wrong title rather than a shortened one, so the last
 * character makes way for an ellipsis.
 */
export const TITLE_MAX_CHARS = 5;

/**
 * The label actually drawn on the ribbon for a group title.
 *
 * Counting is done over code points, not UTF-16 units: an emoji or a character
 * outside the basic plane is one glyph on screen but two units in a string, and
 * slicing by unit would cut it in half and render a replacement box.
 */
export function titleLabel(title: string): string {
  const chars = Array.from(title.trim());
  if (chars.length <= TITLE_MAX_CHARS) return chars.join('');
  return `${chars.slice(0, TITLE_MAX_CHARS - 1).join('')}…`;
}

/** Create a new group. The seed keeps ids unique within one session. */
export function createGroup(title: string, seed: string): RibbonGroup {
  return {
    id: `g-${seed}`,
    title,
    color: '',
    icon: '',
    showTitle: true,
    collapsed: false,
    hidden: false,
    itemIds: [],
  };
}

/**
 * Coerce loaded settings into a usable shape.
 *
 * The settings file is JSON: it may have been hand-edited, written by an older
 * version, pasted in through the import box, or be missing entirely. One rule
 * matters above the rest — **a button belongs to exactly one group**. On a
 * duplicate the first occurrence wins and the rest are dropped, because
 * applying a layout where one id appears twice would `appendChild` the same
 * node into two places; the first group would silently end up empty and the
 * button would look like it jumped.
 */
export function normalizeSettings(raw: unknown): RibbonGroupsSettings {
  const input = (raw ?? {}) as Partial<RibbonGroupsSettings>;
  const seen = new Set<string>();
  const usedGroupIds = new Set<string>();

  const groups: RibbonGroup[] = [];
  for (const g of Array.isArray(input.groups) ? input.groups : []) {
    if (!g || typeof g !== 'object') continue;

    const id = typeof g.id === 'string' && g.id ? g.id : `g-${groups.length}`;
    if (usedGroupIds.has(id)) continue;
    usedGroupIds.add(id);

    const itemIds: string[] = [];
    for (const itemId of Array.isArray(g.itemIds) ? g.itemIds : []) {
      if (typeof itemId !== 'string' || !itemId || seen.has(itemId)) continue;
      seen.add(itemId);
      itemIds.push(itemId);
    }

    groups.push({
      id,
      title: typeof g.title === 'string' ? g.title : '',
      color: typeof g.color === 'string' && COLOR_PATTERN.test(g.color.trim()) ? g.color.trim() : '',
      icon: typeof g.icon === 'string' && ICON_NAME_PATTERN.test(g.icon) ? g.icon : '',
      showTitle: g.showTitle !== false,
      collapsed: g.collapsed === true,
      hidden: g.hidden === true,
      itemIds,
    });
  }

  return {
    groups,
    ungrouped: input.ungrouped === 'top' ? 'top' : DEFAULT_SETTINGS.ungrouped,
    keepMissing: input.keepMissing !== false,
    hideUngrouped: input.hideUngrouped === true,
    compact: input.compact === true,
  };
}

/**
 * Parse a settings JSON string, or return null if it is not usable.
 *
 * Used by the import box, which is the one place arbitrary text becomes
 * settings. Everything that survives `JSON.parse` still goes through
 * `normalizeSettings`, so an import can never produce a shape the rest of the
 * plugin does not expect.
 */
export function parseSettingsJson(text: string): RibbonGroupsSettings | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return normalizeSettings(raw);
}

/** Serialise settings for the export box. */
export function serializeSettings(settings: RibbonGroupsSettings): string {
  return JSON.stringify(settings, null, 2);
}

/** Buttons not in any group, keeping the order Obsidian gave them. */
export function ungroupedIds(settings: RibbonGroupsSettings, allIds: string[]): string[] {
  const grouped = new Set(settings.groups.flatMap((g) => g.itemIds));
  return allIds.filter((id) => !grouped.has(id));
}

/**
 * Work out the final on-screen order.
 *
 * Ids listed in a group but absent from the ribbon this time are filtered out —
 * that plugin is disabled — but **not removed from the settings**; see
 * `keepMissing`.
 */
export function layout(settings: RibbonGroupsSettings, allIds: string[]): LayoutBlock[] {
  const present = new Set(allIds);
  const blocks: LayoutBlock[] = settings.groups.map((group) => ({
    kind: 'group' as const,
    group,
    itemIds: group.itemIds.filter((id) => present.has(id)),
    hidden: group.hidden,
  }));

  const loose = ungroupedIds(settings, allIds);
  if (loose.length > 0) {
    const block: LayoutBlock = { kind: 'ungrouped', itemIds: loose, hidden: settings.hideUngrouped };
    if (settings.ungrouped === 'top') blocks.unshift(block);
    else blocks.push(block);
  }

  return blocks;
}

/** Buttons the ribbon will not show, because their block is hidden. */
export function hiddenIds(settings: RibbonGroupsSettings, allIds: string[]): string[] {
  return layout(settings, allIds)
    .filter((b) => b.hidden)
    .flatMap((b) => b.itemIds);
}

/**
 * Move a button to a position within a group.
 *
 * Passing `null` for `toGroupId` moves it out of every group, back to the
 * ungrouped area. The source is removed first, so `toIndex` is always an index
 * into the list *after* removal — see `adjustForSelfMove` in `dragList.ts`.
 */
export function moveItem(
  settings: RibbonGroupsSettings,
  itemId: string,
  toGroupId: string | null,
  toIndex: number
): RibbonGroupsSettings {
  const groups = settings.groups.map((g) => ({ ...g, itemIds: g.itemIds.filter((id) => id !== itemId) }));

  if (toGroupId === null) return { ...settings, groups };

  const target = groups.find((g) => g.id === toGroupId);
  if (!target) return { ...settings, groups };

  const at = clamp(toIndex, 0, target.itemIds.length);
  target.itemIds.splice(at, 0, itemId);
  return { ...settings, groups };
}

/** Reorder the groups themselves. */
export function moveGroup(
  settings: RibbonGroupsSettings,
  groupId: string,
  toIndex: number
): RibbonGroupsSettings {
  const from = settings.groups.findIndex((g) => g.id === groupId);
  if (from < 0) return settings;

  const groups = [...settings.groups];
  const [moved] = groups.splice(from, 1);
  groups.splice(clamp(toIndex, 0, groups.length), 0, moved);
  return { ...settings, groups };
}

/**
 * Delete a group. Its buttons return to the ungrouped area rather than
 * disappearing — what is deleted is the grouping, not the buttons.
 */
export function removeGroup(settings: RibbonGroupsSettings, groupId: string): RibbonGroupsSettings {
  return { ...settings, groups: settings.groups.filter((g) => g.id !== groupId) };
}

export function updateGroup(
  settings: RibbonGroupsSettings,
  groupId: string,
  patch: Partial<Omit<RibbonGroup, 'id' | 'itemIds'>>
): RibbonGroupsSettings {
  return {
    ...settings,
    groups: settings.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)),
  };
}

/** Collapse or expand every group at once, for the commands. */
export function setAllCollapsed(settings: RibbonGroupsSettings, collapsed: boolean): RibbonGroupsSettings {
  return { ...settings, groups: settings.groups.map((g) => ({ ...g, collapsed })) };
}

/** Drop ids that no longer match a button. Only called when the user asks. */
export function pruneMissing(settings: RibbonGroupsSettings, allIds: string[]): RibbonGroupsSettings {
  const present = new Set(allIds);
  return {
    ...settings,
    groups: settings.groups.map((g) => ({ ...g, itemIds: g.itemIds.filter((id) => present.has(id)) })),
  };
}

/** Ids the settings mention that the ribbon does not currently have. */
export function missingIds(settings: RibbonGroupsSettings, allIds: string[]): string[] {
  const present = new Set(allIds);
  return settings.groups.flatMap((g) => g.itemIds).filter((id) => !present.has(id));
}

/**
 * Buttons whose title matches a search query, case-insensitively.
 *
 * The settings pane lists every ribbon button, and a well-populated vault has
 * dozens. Filtering by title is the difference between finding one and
 * scrolling for it.
 */
export function matchesQuery(title: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return title.toLowerCase().includes(q);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
