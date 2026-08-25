/**
 * Tests for the grouping logic.
 *
 * The focus is on states where a button would go missing or end up in the wrong
 * group. Those are the only failures a user actually notices, and they happen
 * without any error to look at.
 */

import { describe, expect, it } from 'vitest';
import {
  createGroup,
  layout,
  matchesQuery,
  missingIds,
  moveGroup,
  moveItem,
  normalizeSettings,
  parseSettingsJson,
  pruneMissing,
  removeGroup,
  serializeSettings,
  setAllCollapsed,
  ungroupedIds,
  updateGroup,
} from '../src/groupLayout';
import { DEFAULT_SETTINGS, type RibbonGroup, type RibbonGroupsSettings } from '../src/types';

const group = (id: string, itemIds: string[], over: Partial<RibbonGroup> = {}): RibbonGroup => ({
  id,
  title: id,
  color: '',
  icon: '',
  showTitle: true,
  collapsed: false,
  itemIds,
  ...over,
});

const settings = (groups: RibbonGroup[], over: Partial<RibbonGroupsSettings> = {}): RibbonGroupsSettings => ({
  ...DEFAULT_SETTINGS,
  groups,
  ...over,
});

describe('normalizeSettings', () => {
  it('produces usable defaults when nothing has been saved', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  // One button in two groups means the same DOM node is appended twice on
  // apply: the first group silently empties and the button looks like it
  // jumped. Reject it at load time.
  it('keeps a button only in the first group that claims it', () => {
    const result = normalizeSettings({
      groups: [group('a', ['x', 'y']), group('b', ['y', 'z'])],
    });
    expect(result.groups[0].itemIds).toEqual(['x', 'y']);
    expect(result.groups[1].itemIds).toEqual(['z']);
  });

  it('drops duplicate group ids, keeping the first', () => {
    const result = normalizeSettings({ groups: [group('a', ['x']), group('a', ['y'])] });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].itemIds).toEqual(['x']);
  });

  it('ignores malformed data instead of throwing', () => {
    const result = normalizeSettings({
      groups: [null, 'nope', { id: 'ok', itemIds: [1, '', 'x', null] }],
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].itemIds).toEqual(['x']);
  });

  // Icon names reach setIcon(), and can arrive from an imported file.
  it('accepts a well-formed icon name and rejects anything else', () => {
    const ok = normalizeSettings({ groups: [group('a', [], { icon: 'folder-open' })] });
    expect(ok.groups[0].icon).toBe('folder-open');

    const bad = normalizeSettings({ groups: [group('a', [], { icon: '<script>x</script>' })] });
    expect(bad.groups[0].icon).toBe('');
  });

  // The colour lands in `background: var(--rg-color)`, so a url() would make
  // the ribbon fetch it. Import means that value can come from a stranger.
  it('accepts literal colour syntax and rejects anything that can fetch', () => {
    for (const ok of ['#fff', '#a1b2c3', 'rgba(1, 2, 3, 0.5)', 'hsl(200 50% 40%)', 'red']) {
      expect(normalizeSettings({ groups: [group('a', [], { color: ok })] }).groups[0].color).toBe(ok);
    }
    for (const bad of ['url(https://example.com/x.png)', 'var(--x)', 'image-set("a.png")', 'red; background: url(x)']) {
      expect(normalizeSettings({ groups: [group('a', [], { color: bad })] }).groups[0].color).toBe('');
    }
  });

  it('reads compact mode, defaulting to off', () => {
    expect(normalizeSettings({ compact: true }).compact).toBe(true);
    expect(normalizeSettings({ compact: 'yes' }).compact).toBe(false);
  });
});

describe('parseSettingsJson', () => {
  it('round-trips exported settings', () => {
    const original = settings([group('a', ['x'], { color: 'red', icon: 'star' })], { compact: true });
    expect(parseSettingsJson(serializeSettings(original))).toEqual(original);
  });

  it('returns null for text that is not settings', () => {
    expect(parseSettingsJson('not json')).toBe(null);
    expect(parseSettingsJson('[1, 2, 3]')).toBe(null);
    expect(parseSettingsJson('"a string"')).toBe(null);
    expect(parseSettingsJson('null')).toBe(null);
  });

  // Import is the one place arbitrary text becomes settings, so the same
  // one-button-one-group rule has to hold there too.
  it('normalises what it parses rather than trusting it', () => {
    const parsed = parseSettingsJson(JSON.stringify({ groups: [group('a', ['x']), group('b', ['x'])] }));
    expect(parsed?.groups[1].itemIds).toEqual([]);
  });
});

describe('ungroupedIds', () => {
  it('keeps the order the ribbon gave, for buttons in no group', () => {
    const s = settings([group('a', ['c'])]);
    expect(ungroupedIds(s, ['a1', 'b1', 'c', 'd1'])).toEqual(['a1', 'b1', 'd1']);
  });
});

describe('layout', () => {
  it('puts the ungrouped area after every group by default', () => {
    const s = settings([group('a', ['x'])]);
    const blocks = layout(s, ['x', 'y']);
    expect(blocks.map((b) => b.kind)).toEqual(['group', 'ungrouped']);
  });

  it('puts it first when set to top', () => {
    const s = settings([group('a', ['x'])], { ungrouped: 'top' });
    const blocks = layout(s, ['x', 'y']);
    expect(blocks.map((b) => b.kind)).toEqual(['ungrouped', 'group']);
  });

  it('emits no ungrouped block when every button is grouped', () => {
    const s = settings([group('a', ['x', 'y'])]);
    expect(layout(s, ['x', 'y']).map((b) => b.kind)).toEqual(['group']);
  });

  // Disabling a plugin removes its button from the ribbon, but the position
  // it was assigned has to survive until it comes back.
  it('skips ids absent from the ribbon without deleting them', () => {
    const s = settings([group('a', ['x', 'gone'])]);
    const blocks = layout(s, ['x']);
    expect(blocks[0]).toMatchObject({ kind: 'group', itemIds: ['x'] });
    expect(s.groups[0].itemIds).toEqual(['x', 'gone']);
  });
});

describe('moveItem', () => {
  it('removes the button from its old group', () => {
    const s = settings([group('a', ['x', 'y']), group('b', [])]);
    const next = moveItem(s, 'x', 'b', 0);
    expect(next.groups[0].itemIds).toEqual(['y']);
    expect(next.groups[1].itemIds).toEqual(['x']);
  });

  // Moving down within one group is the easy one to get wrong: removing the
  // source first shifts every later index one place forward.
  it('lands where expected when moving down within a group', () => {
    const s = settings([group('a', ['x', 'y', 'z'])]);
    expect(moveItem(s, 'x', 'a', 2).groups[0].itemIds).toEqual(['y', 'z', 'x']);
    expect(moveItem(s, 'x', 'a', 1).groups[0].itemIds).toEqual(['y', 'x', 'z']);
  });

  it('lands where expected when moving up within a group', () => {
    const s = settings([group('a', ['x', 'y', 'z'])]);
    expect(moveItem(s, 'z', 'a', 0).groups[0].itemIds).toEqual(['z', 'x', 'y']);
  });

  it('treats a null target as "leave every group"', () => {
    const s = settings([group('a', ['x', 'y'])]);
    expect(moveItem(s, 'x', null, 0).groups[0].itemIds).toEqual(['y']);
  });

  it('clamps an out-of-range index instead of losing the button', () => {
    const s = settings([group('a', ['x', 'y'])]);
    expect(moveItem(s, 'x', 'a', 99).groups[0].itemIds).toEqual(['y', 'x']);
    expect(moveItem(s, 'y', 'a', -5).groups[0].itemIds).toEqual(['y', 'x']);
  });

  it('only detaches the button when the target group is gone', () => {
    const s = settings([group('a', ['x'])]);
    expect(moveItem(s, 'x', 'nope', 0).groups[0].itemIds).toEqual([]);
  });
});

describe('moveGroup', () => {
  it('reorders groups', () => {
    const s = settings([group('a', []), group('b', []), group('c', [])]);
    expect(moveGroup(s, 'c', 0).groups.map((g) => g.id)).toEqual(['c', 'a', 'b']);
    expect(moveGroup(s, 'a', 2).groups.map((g) => g.id)).toEqual(['b', 'c', 'a']);
  });

  it('does nothing for an unknown group', () => {
    const s = settings([group('a', [])]);
    expect(moveGroup(s, 'nope', 0)).toBe(s);
  });
});

describe('removeGroup', () => {
  // What is deleted is the grouping, not the buttons.
  it('sends the group’s buttons back to the ungrouped area', () => {
    const s = settings([group('a', ['x', 'y'])]);
    const next = removeGroup(s, 'a');
    expect(next.groups).toEqual([]);
    expect(ungroupedIds(next, ['x', 'y'])).toEqual(['x', 'y']);
  });
});

describe('updateGroup', () => {
  it('patches only the named fields, leaving the button list alone', () => {
    const s = settings([group('a', ['x'])]);
    const next = updateGroup(s, 'a', { color: 'red', collapsed: true });
    expect(next.groups[0]).toMatchObject({ color: 'red', collapsed: true, itemIds: ['x'] });
  });
});

describe('setAllCollapsed', () => {
  it('collapses and expands every group at once', () => {
    const s = settings([group('a', [], { collapsed: true }), group('b', [])]);
    expect(setAllCollapsed(s, true).groups.map((g) => g.collapsed)).toEqual([true, true]);
    expect(setAllCollapsed(s, false).groups.map((g) => g.collapsed)).toEqual([false, false]);
  });
});

describe('missingIds and pruneMissing', () => {
  it('lists ids the settings have but the ribbon does not', () => {
    const s = settings([group('a', ['x', 'gone'])]);
    expect(missingIds(s, ['x'])).toEqual(['gone']);
  });

  it('stops listing them once pruned', () => {
    const s = pruneMissing(settings([group('a', ['x', 'gone'])]), ['x']);
    expect(s.groups[0].itemIds).toEqual(['x']);
  });
});

describe('matchesQuery', () => {
  it('matches case-insensitively on a substring', () => {
    expect(matchesQuery('Open Graph View', 'graph')).toBe(true);
    expect(matchesQuery('Open Graph View', 'GRAPH')).toBe(true);
    expect(matchesQuery('Open Graph View', 'canvas')).toBe(false);
  });

  it('matches everything when the query is blank', () => {
    expect(matchesQuery('anything', '')).toBe(true);
    expect(matchesQuery('anything', '   ')).toBe(true);
  });
});

describe('createGroup', () => {
  it('gives different seeds different ids', () => {
    expect(createGroup('n', '1').id).not.toBe(createGroup('n', '2').id);
  });
});
