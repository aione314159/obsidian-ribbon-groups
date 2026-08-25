/**
 * Index maths for drag-and-drop lists.
 *
 * This module is deliberately free of DOM and Obsidian APIs. "Where does the
 * dragged thing land when the pointer is released" is the single most
 * error-prone part of a reorderable list, and it is pure arithmetic: given the
 * measured geometry and a pointer position, produce an index. Keeping it here
 * means it can be tested without simulating a full drag gesture.
 */

/** An axis-aligned rectangle in viewport coordinates. */
export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * A measured drop area, produced by the DOM layer just before a drag starts.
 *
 * `groupId` is `null` for the ungrouped area, mirroring the settings model.
 */
export interface DropZone {
  groupId: string | null;
  rect: Rect;
  /** Vertical centres of the rows already in this zone, top to bottom. */
  itemCenters: number[];
}

/** Where a dragged button should be inserted. */
export interface DropTarget {
  groupId: string | null;
  /** Insertion index within the target zone, before self-move adjustment. */
  index: number;
}

/**
 * How far outside a zone the pointer may sit and still count as inside it.
 *
 * Zones are separated by card padding, so a pointer released in the gap between
 * two cards would otherwise resolve to nothing and silently drop the gesture.
 * Snapping to the nearest zone within this distance makes the interaction
 * forgiving without letting a release halfway down the page land somewhere
 * arbitrary.
 */
export const ZONE_SNAP_PX = 28;

/**
 * Which insertion slot the pointer is over.
 *
 * The result ranges from 0 to `centers.length`, meaning "insert before item n";
 * `centers.length` means append. Comparison is against each item's centre
 * rather than its edges so that the upper and lower halves of a row give
 * different answers.
 */
export function insertIndexFor(centers: number[], pointer: number): number {
  for (let i = 0; i < centers.length; i += 1) {
    if (pointer < centers[i]) return i;
  }
  return centers.length;
}

/**
 * Convert an insertion index into one valid after the source has been removed.
 *
 * Moving an item further down within the same list removes the source first,
 * shifting every later index one place towards the front. Splicing with the
 * unadjusted index would insert one slot too late. Moving between lists has no
 * such problem.
 */
export function adjustForSelfMove(insertIndex: number, fromIndex: number | null): number {
  if (fromIndex === null || insertIndex <= fromIndex) return insertIndex;
  return insertIndex - 1;
}

/** Read the vertical centres of a row of elements, for `insertIndexFor`. */
export function verticalCenters(elements: HTMLElement[]): number[] {
  return elements.map((el) => {
    const rect = el.getBoundingClientRect();
    return rect.top + rect.height / 2;
  });
}

/** Measure an element into the plain shape this module works with. */
export function measureRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
}

/** Vertical distance from a point to a rectangle; 0 when the point is inside. */
function verticalDistance(rect: Rect, y: number): number {
  if (y < rect.top) return rect.top - y;
  if (y > rect.bottom) return y - rect.bottom;
  return 0;
}

/**
 * Pick the zone the pointer is over.
 *
 * Only the vertical axis is considered. The settings pane is a single column,
 * so horizontal position carries no information, and ignoring it means a
 * pointer that has drifted past the left or right edge of a card still resolves
 * to that card instead of dropping the gesture.
 *
 * Returns `null` when nothing is within `ZONE_SNAP_PX`, which the caller should
 * treat as "cancel", not as "move to the first zone".
 */
export function resolveZone(zones: DropZone[], y: number): DropZone | null {
  let best: DropZone | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const zone of zones) {
    const distance = verticalDistance(zone.rect, y);
    if (distance < bestDistance) {
      best = zone;
      bestDistance = distance;
    }
  }

  return bestDistance <= ZONE_SNAP_PX ? best : null;
}

/**
 * Resolve a pointer position into "which group, which index".
 *
 * This is the whole drop decision in one pure function: the DOM layer measures,
 * this decides, and the settings model applies. `fromIndex` is the dragged
 * item's current position within the zone it started in, or `null` when it came
 * from a different zone.
 */
export function resolveDropTarget(
  zones: DropZone[],
  y: number,
  fromGroupId: string | null,
  fromIndex: number | null
): DropTarget | null {
  const zone = resolveZone(zones, y);
  if (!zone) return null;

  const raw = insertIndexFor(zone.itemCenters, y);
  const sameZone = zone.groupId === fromGroupId;
  return { groupId: zone.groupId, index: adjustForSelfMove(raw, sameZone ? fromIndex : null) };
}
