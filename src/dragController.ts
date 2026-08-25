/**
 * Pointer-based dragging for the settings pane.
 *
 * The previous implementation used the HTML5 drag-and-drop API. That API is a
 * poor fit here for three reasons, and all three are user-visible bugs:
 *
 * 1. **Touch devices get nothing.** The manifest declares `isDesktopOnly:
 *    false`, but `dragstart` never fires for touch input, so on iOS and Android
 *    the settings pane looks interactive and simply does not respond.
 * 2. **A drop is easy to lose.** A drop target only accepts a release if every
 *    `dragover` on the way calls `preventDefault()`. Any gap between cards, any
 *    frame where the pointer is over a non-target ancestor, and the gesture is
 *    discarded with no feedback.
 * 3. **It cannot be tested.** `DataTransfer` and the drag event sequence are
 *    not implemented by DOM test environments, so the most fragile logic in the
 *    plugin had no test coverage at all.
 *
 * Pointer events have none of those problems: one code path for mouse, pen and
 * touch, an explicit capture that survives whatever the pointer travels over,
 * and a drop decision that is plain arithmetic in `dragList.ts`.
 *
 * Everything geometric lives in `dragList.ts`. This file only measures the DOM,
 * draws the insertion line, and reports the result.
 */

import { measureRect, resolveDropTarget, verticalCenters, type DropTarget, type DropZone } from './dragList';

/**
 * Movement required before a press turns into a drag.
 *
 * Without it, a plain click on the handle would start a drag, and a touch would
 * begin one on the slightest finger tremor.
 */
const DRAG_THRESHOLD_PX = 4;

/** Distance from the viewport edge at which the pane starts auto-scrolling. */
const EDGE_SCROLL_MARGIN_PX = 48;

/** Pixels scrolled per frame while the pointer sits in the edge band. */
const EDGE_SCROLL_SPEED_PX = 12;

/** A drop area together with the DOM it was measured from. */
export interface ZoneRef {
  zone: DropZone;
  /** Container the insertion line is drawn inside. */
  el: HTMLElement;
  /** Rows currently in the zone, in document order. */
  rows: HTMLElement[];
}

/** What a single draggable handle needs to know about the thing it moves. */
export interface DragBinding {
  /** The element that fades out while it is being dragged. */
  source: HTMLElement;
  /** Group the dragged thing currently belongs to; `null` for the ungrouped area. */
  fromGroupId: string | null;
  /** Zones measured at drag start. Recomputed per gesture, never cached. */
  measure: () => ZoneRef[];
  /** Called on release with a resolved target; not called when the drag is cancelled. */
  commit: (target: DropTarget) => void;
}

interface Session extends DragBinding {
  pointerId: number;
  startY: number;
  started: boolean;
  zones: ZoneRef[];
  /** Index of `source` within its own zone, or null when it is not in one. */
  fromIndex: number | null;
  line: HTMLElement | null;
  target: DropTarget | null;
  /** Scroll container, or null when the pane does not scroll. */
  scroller: HTMLElement | null;
  scrollFrame: number | null;
  lastY: number;
}

export class PointerDragController {
  private session: Session | null = null;

  /**
   * Make `handle` drag `binding.source`.
   *
   * Listeners are added to the handle only. Because the pointer is captured on
   * `pointerdown`, later moves are delivered to the handle no matter what the
   * pointer is actually over, which is exactly the guarantee HTML5 drag and
   * drop failed to give.
   */
  bind(handle: HTMLElement, binding: DragBinding): void {
    handle.addEventListener('pointerdown', (e) => this.onPointerDown(e, handle, binding));
    handle.addEventListener('pointermove', (e) => this.onPointerMove(e));
    handle.addEventListener('pointerup', (e) => this.onPointerUp(e));
    handle.addEventListener('pointercancel', () => this.cancel());
    // A drag in progress owns the Escape key; the settings pane would otherwise close.
    handle.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.session) {
        e.stopPropagation();
        this.cancel();
      }
    });
  }

  /** Abort any drag in progress. Call this before the pane is rebuilt. */
  cancel(): void {
    const session = this.session;
    if (!session) return;

    this.stopEdgeScroll(session);
    session.line?.remove();
    session.source.removeClass('is-dragging');
    this.session = null;
  }

  private onPointerDown(e: PointerEvent, handle: HTMLElement, binding: DragBinding): void {
    // Ignore secondary buttons; `button` is 0 for touch and pen contact too.
    if (e.button !== 0) return;
    this.cancel();

    handle.setPointerCapture(e.pointerId);
    this.session = {
      ...binding,
      pointerId: e.pointerId,
      startY: e.clientY,
      started: false,
      zones: [],
      fromIndex: null,
      line: null,
      target: null,
      scroller: null,
      scrollFrame: null,
      lastY: e.clientY,
    };
  }

  private onPointerMove(e: PointerEvent): void {
    const session = this.session;
    if (!session || e.pointerId !== session.pointerId) return;

    session.lastY = e.clientY;

    if (!session.started) {
      if (Math.abs(e.clientY - session.startY) < DRAG_THRESHOLD_PX) return;
      this.begin(session);
    }

    // Stops the page from selecting text or panning under the finger.
    e.preventDefault();
    this.updateTarget(session, e.clientY);
    this.updateEdgeScroll(session, e.clientY);
  }

  private onPointerUp(e: PointerEvent): void {
    const session = this.session;
    if (!session || e.pointerId !== session.pointerId) return;

    const target = session.started ? session.target : null;
    const commit = session.commit;
    this.cancel();
    if (target) commit(target);
  }

  /** Promote a press into a real drag: measure once, then show the line. */
  private begin(session: Session): void {
    session.started = true;
    session.zones = session.measure();
    session.source.addClass('is-dragging');

    const own = session.zones.find((z) => z.zone.groupId === session.fromGroupId);
    const at = own ? own.rows.indexOf(session.source) : -1;
    session.fromIndex = at < 0 ? null : at;

    session.line = createDiv({ cls: 'ribbon-groups-drop-line' });
    session.scroller = findScroller(session.source);
  }

  private updateTarget(session: Session, y: number): void {
    const zones = session.zones.map((z) => z.zone);
    const target = resolveDropTarget(zones, y, session.fromGroupId, session.fromIndex);
    session.target = target;

    const line = session.line;
    if (!line) return;

    if (!target) {
      line.remove();
      return;
    }

    const ref = session.zones.find((z) => z.zone.groupId === target.groupId);
    if (!ref) {
      line.remove();
      return;
    }

    // `target.index` is already adjusted for the source being removed, so undo
    // that here: the line is drawn against the list as it currently stands.
    const visual =
      session.fromIndex !== null && ref.zone.groupId === session.fromGroupId && target.index >= session.fromIndex
        ? target.index + 1
        : target.index;

    const before = ref.rows[visual];
    if (before) ref.el.insertBefore(line, before);
    else ref.el.appendChild(line);
  }

  /**
   * Scroll the pane when the pointer nears its edge.
   *
   * Without this a long list cannot be reordered across a screen boundary at
   * all: the pointer is captured, so the pane never receives the wheel or touch
   * events that would normally scroll it.
   */
  private updateEdgeScroll(session: Session, y: number): void {
    const scroller = session.scroller;
    if (!scroller) return;

    const rect = scroller.getBoundingClientRect();
    const up = y - rect.top < EDGE_SCROLL_MARGIN_PX;
    const down = rect.bottom - y < EDGE_SCROLL_MARGIN_PX;

    if (!up && !down) {
      this.stopEdgeScroll(session);
      return;
    }
    if (session.scrollFrame !== null) return;

    const step = (): void => {
      if (this.session !== session) return;
      const delta = session.lastY - rect.top < EDGE_SCROLL_MARGIN_PX ? -EDGE_SCROLL_SPEED_PX : EDGE_SCROLL_SPEED_PX;
      scroller.scrollTop += delta;
      // Rows moved under the pointer, so the measurements taken at drag start
      // are stale. Re-measure rather than aiming at where things used to be.
      session.zones = session.measure();
      this.updateTarget(session, session.lastY);
      session.scrollFrame = requestAnimationFrame(step);
    };
    session.scrollFrame = requestAnimationFrame(step);
  }

  private stopEdgeScroll(session: Session): void {
    if (session.scrollFrame === null) return;
    cancelAnimationFrame(session.scrollFrame);
    session.scrollFrame = null;
  }
}

/** Nearest scrollable ancestor, used for edge auto-scrolling. */
function findScroller(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

/** Measure a container and its rows into the shape `dragList` expects. */
export function measureZone(el: HTMLElement, groupId: string | null, rows: HTMLElement[]): ZoneRef {
  return {
    zone: { groupId, rect: measureRect(el), itemCenters: verticalCenters(rows) },
    el,
    rows,
  };
}
