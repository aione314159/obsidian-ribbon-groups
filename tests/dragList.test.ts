import { describe, expect, it } from 'vitest';
import {
  ZONE_SNAP_PX,
  adjustForSelfMove,
  insertIndexFor,
  resolveDropTarget,
  resolveRibbonDrop,
  resolveZone,
  type DropZone,
  type RibbonZone,
} from '../src/dragList';

describe('insertIndexFor', () => {
  const centers = [10, 30, 50];

  it('inserts at the front when the pointer is above the first row', () => {
    expect(insertIndexFor(centers, 5)).toBe(0);
  });

  it('appends when the pointer is below the last row', () => {
    expect(insertIndexFor(centers, 99)).toBe(3);
  });

  // Centres, not edges: the top and bottom halves of a row must differ.
  it('switches sides at the centre of a row', () => {
    expect(insertIndexFor(centers, 29)).toBe(1);
    expect(insertIndexFor(centers, 31)).toBe(2);
  });

  it('always returns 0 for an empty list', () => {
    expect(insertIndexFor([], 42)).toBe(0);
  });
});

describe('adjustForSelfMove', () => {
  // Moving down within one list removes the source first, shifting later indices.
  it('subtracts the vacated slot when moving down in the same list', () => {
    expect(adjustForSelfMove(3, 1)).toBe(2);
  });

  it('leaves an upward move alone', () => {
    expect(adjustForSelfMove(0, 2)).toBe(0);
    expect(adjustForSelfMove(2, 2)).toBe(2);
  });

  it('leaves a cross-list move alone', () => {
    expect(adjustForSelfMove(3, null)).toBe(3);
  });
});

function zone(groupId: string | null, top: number, bottom: number, itemCenters: number[] = []): DropZone {
  return { groupId, rect: { top, bottom, left: 0, right: 100 }, itemCenters };
}

describe('resolveZone', () => {
  const zones = [zone('a', 0, 100), zone('b', 140, 240), zone(null, 280, 380)];

  it('picks the zone the pointer is inside', () => {
    expect(resolveZone(zones, 50)?.groupId).toBe('a');
    expect(resolveZone(zones, 200)?.groupId).toBe('b');
    expect(resolveZone(zones, 300)?.groupId).toBe(null);
  });

  // The gap between cards is dead space in a strict hit test, which is where
  // the HTML5 implementation used to silently drop the gesture.
  it('snaps to the nearest zone when released in the gap between cards', () => {
    expect(resolveZone(zones, 110)?.groupId).toBe('a');
    expect(resolveZone(zones, 130)?.groupId).toBe('b');
  });

  it('gives up when nothing is within the snap distance', () => {
    expect(resolveZone(zones, 380 + ZONE_SNAP_PX + 1)).toBe(null);
    expect(resolveZone([], 50)).toBe(null);
  });

  it('resolves by vertical distance only, ignoring horizontal drift', () => {
    // x is never consulted, so a pointer far to the side still lands in 'a'.
    expect(resolveZone(zones, 50)?.groupId).toBe('a');
  });
});

describe('resolveDropTarget', () => {
  // Zone 'a' holds two rows, zone 'b' is empty. This is the case that was
  // broken: dragging a button into a group produced no change at all.
  const zones = [zone('a', 0, 100, [20, 60]), zone('b', 140, 240, []), zone(null, 280, 380, [300, 340])];

  it('moves a button from the ungrouped area into an empty group', () => {
    expect(resolveDropTarget(zones, 190, null, 0)).toEqual({ groupId: 'b', index: 0 });
  });

  it('moves a button from the ungrouped area into a populated group', () => {
    expect(resolveDropTarget(zones, 10, null, 1)).toEqual({ groupId: 'a', index: 0 });
    expect(resolveDropTarget(zones, 40, null, 1)).toEqual({ groupId: 'a', index: 1 });
    expect(resolveDropTarget(zones, 90, null, 1)).toEqual({ groupId: 'a', index: 2 });
  });

  it('moves a button back out to the ungrouped area', () => {
    expect(resolveDropTarget(zones, 320, 'a', 0)).toEqual({ groupId: null, index: 1 });
  });

  // Same-zone reordering is the case adjustForSelfMove exists for.
  it('adjusts the index when reordering inside one group', () => {
    expect(resolveDropTarget(zones, 90, 'a', 0)).toEqual({ groupId: 'a', index: 1 });
    expect(resolveDropTarget(zones, 10, 'a', 1)).toEqual({ groupId: 'a', index: 0 });
  });

  it('reports no target when the pointer is released far from every zone', () => {
    expect(resolveDropTarget(zones, 1000, 'a', 0)).toBe(null);
  });
});

describe('resolveRibbonDrop', () => {
  const zone = (
    groupId: string | null,
    top: number,
    bottom: number,
    over: Partial<RibbonZone> = {}
  ): RibbonZone => ({
    groupId,
    rect: { top, bottom, left: 0, right: 44 },
    itemCenters: [],
    collapsed: false,
    count: 0,
    ...over,
  });

  const open = zone('a', 0, 100, { itemCenters: [20, 60], count: 2 });
  const shut = zone('b', 100, 140, { collapsed: true, count: 3 });
  const loose = zone(null, 140, 240, { itemCenters: [160, 200], count: 2 });

  it('behaves like the settings pane for an expanded group', () => {
    expect(resolveRibbonDrop([open, shut, loose], 10, null, null)).toEqual({ groupId: 'a', index: 0 });
    expect(resolveRibbonDrop([open, shut, loose], 90, null, null)).toEqual({ groupId: 'a', index: 2 });
  });

  // A closed group shows no buttons, so there is no gap to aim between
  it('appends into a collapsed group wherever it is dropped', () => {
    expect(resolveRibbonDrop([open, shut, loose], 105, null, null)).toEqual({ groupId: 'b', index: 3 });
    expect(resolveRibbonDrop([open, shut, loose], 135, null, null)).toEqual({ groupId: 'b', index: 3 });
  });

  // The source is removed before the insert, so the append index moves back one
  it('accounts for the source when appending within the same collapsed group', () => {
    expect(resolveRibbonDrop([open, shut, loose], 120, 'b', 0)).toEqual({ groupId: 'b', index: 2 });
  });

  it('resolves the ungrouped block, which is what dragging out of a group lands on', () => {
    expect(resolveRibbonDrop([open, shut, loose], 150, 'a', null)).toEqual({ groupId: null, index: 0 });
    expect(resolveRibbonDrop([open, shut, loose], 230, 'a', null)).toEqual({ groupId: null, index: 2 });
  });

  it('cancels when the pointer is released well away from every block', () => {
    expect(resolveRibbonDrop([open, shut, loose], 240 + ZONE_SNAP_PX + 1, 'a', null)).toBeNull();
  });
});
