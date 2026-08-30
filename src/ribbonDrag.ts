/**
 * Dragging buttons on the ribbon itself.
 *
 * The settings pane can already move a button between groups, but that means
 * opening settings to do something the ribbon is showing you right now. This
 * puts the same move where the buttons are.
 *
 * Three constraints shape the implementation:
 *
 * 1. **A click must stay a click.** Ribbon buttons belong to other plugins and
 *    their whole purpose is to be clicked. Nothing is captured until the
 *    pointer has moved past a threshold, so a press that never turns into a
 *    drag reaches the button untouched. Once a drag has happened the click that
 *    follows it is swallowed in the capture phase, before the button sees it.
 *
 * 2. **Listeners must not accumulate or leak.** The buttons are not ours and
 *    they outlive every re-render, so binding to each one would add a duplicate
 *    listener on every apply and leave the survivors behind on unload. Instead
 *    one set of listeners sits on the ribbon container and finds the button
 *    from the event, and `detach()` takes all of them off again.
 *
 * 3. **Dragging out of a group needs somewhere to land.** When every button is
 *    grouped there is no ungrouped block on screen, so a temporary "drop here"
 *    area is added for the duration of the gesture and removed after it.
 *
 * The geometry lives in `dragList.ts`. This file measures, draws and reports.
 */

import { measureRect, resolveRibbonDrop, verticalCenters, type DropTarget, type RibbonZone } from './dragList';
import { ACTION_SELECTOR } from './ribbonDom';

/**
 * Movement before a press counts as a drag.
 *
 * Small enough that the gesture feels immediate, large enough that a click
 * delivered with a shaking hand still opens what it was aimed at.
 */
const DRAG_THRESHOLD_PX = 5;

/** One rendered block of the ribbon, as the manager knows it. */
export interface RibbonBlockRef {
  /** Group id, or null for the ungrouped block. */
  groupId: string | null;
  /** The whole block: the hit area, and what gets highlighted. */
  wrapper: HTMLElement;
  /** Where the buttons sit and the insertion line is drawn. */
  slot: HTMLElement;
  collapsed: boolean;
}

/** What the controller needs from the manager. */
export interface RibbonDragHost {
  /** Item id for a ribbon button, or null when it is not one we track. */
  idOf: (el: HTMLElement) => string | null;
  /** Blocks currently on the ribbon, top to bottom. */
  blocks: () => RibbonBlockRef[];
  /** Add the temporary ungrouped drop area, or null if it could not be added. */
  addPlaceholder: () => HTMLElement | null;
  /** Apply a resolved drop. */
  move: (itemId: string, groupId: string | null, index: number) => void;
}

/** A block together with the geometry measured from it. */
interface ZoneRef extends RibbonBlockRef {
  zone: RibbonZone;
  rows: HTMLElement[];
}

interface Session {
  pointerId: number;
  button: HTMLElement;
  itemId: string;
  fromGroupId: string | null;
  startX: number;
  startY: number;
  started: boolean;
  zones: ZoneRef[];
  /** Index of the button within the block it started in, or null. */
  fromIndex: number | null;
  line: HTMLElement | null;
  hover: HTMLElement | null;
  placeholder: HTMLElement | null;
  target: DropTarget | null;
}

export class RibbonDragController {
  private container: HTMLElement | null = null;
  private session: Session | null = null;
  /** Set when a drag ends, so the click it generates is discarded. */
  private swallowClick = false;

  private readonly onPointerDown = (e: PointerEvent): void => this.pointerDown(e);
  private readonly onPointerMove = (e: PointerEvent): void => this.pointerMove(e);
  private readonly onPointerUp = (e: PointerEvent): void => this.pointerUp(e);
  private readonly onPointerCancel = (): void => this.cancel();
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || !this.session?.started) return;
    e.preventDefault();
    e.stopPropagation();
    this.cancel();
  };
  private readonly onClickCapture = (e: MouseEvent): void => {
    if (!this.swallowClick) return;
    this.swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  };

  constructor(private readonly host: RibbonDragHost) {}

  /**
   * Take over the container. Safe to call on every apply: the same container
   * twice is a no-op, and a different one detaches from the old first.
   */
  attach(container: HTMLElement): void {
    if (this.container === container) return;
    this.detach();

    container.addEventListener('pointerdown', this.onPointerDown);
    container.addEventListener('pointermove', this.onPointerMove);
    container.addEventListener('pointerup', this.onPointerUp);
    container.addEventListener('pointercancel', this.onPointerCancel);
    // Capture phase: the button's own handler must never see this click.
    container.addEventListener('click', this.onClickCapture, true);
    this.container = container;
  }

  /** Give the container back exactly as it was found. */
  detach(): void {
    this.cancel();
    const container = this.container;
    if (!container) return;

    container.removeEventListener('pointerdown', this.onPointerDown);
    container.removeEventListener('pointermove', this.onPointerMove);
    container.removeEventListener('pointerup', this.onPointerUp);
    container.removeEventListener('pointercancel', this.onPointerCancel);
    container.removeEventListener('click', this.onClickCapture, true);
    this.container = null;
  }

  /** Abort a drag and undo every visual trace of it. */
  cancel(): void {
    const session = this.session;
    this.session = null;
    if (!session) return;

    window.removeEventListener('keydown', this.onKeyDown, true);
    this.container?.removeClass('ribbon-groups-is-dragging');
    session.line?.remove();
    session.placeholder?.remove();
    session.hover?.removeClass('is-rg-drop');
    session.button.removeClass('is-rg-dragging');

    if (this.container?.hasPointerCapture(session.pointerId)) {
      this.container.releasePointerCapture(session.pointerId);
    }
  }

  private pointerDown(e: PointerEvent): void {
    // Secondary buttons open Obsidian's own menus; `button` is 0 for touch too.
    if (e.button !== 0) return;
    this.cancel();
    this.swallowClick = false;

    const container = this.container;
    const from = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>(ACTION_SELECTOR) : null;
    if (!container || !from || !container.contains(from)) return;

    const itemId = this.host.idOf(from);
    if (!itemId) return;

    // Obsidian arms its own ribbon drag from `mousedown` — the buttons are not
    // `draggable`, it runs a mouse-driven DragManager instead. On the first
    // move it reparents the button out of our wrapper and straight into the
    // container, which is exactly the mutation our MutationObserver watches
    // for: the layout is reapplied and this gesture is cancelled before it can
    // resolve anything. Measured on Obsidian 1.13.7 over CDP; the giveaway is
    // the `drag-ghost-hidden` class appearing on the button.
    //
    // Cancelling pointerdown suppresses the compatibility mouse events
    // (mousedown, mousemove, mouseup) for this pointer, so that drag never
    // arms. `click` is not a compatibility event and still fires, which is what
    // keeps a press that never becomes a drag working as a plain click.
    e.preventDefault();

    const block = this.host.blocks().find((b) => b.slot.contains(from));
    this.session = {
      pointerId: e.pointerId,
      button: from,
      itemId,
      fromGroupId: block ? block.groupId : null,
      startX: e.clientX,
      startY: e.clientY,
      started: false,
      zones: [],
      fromIndex: null,
      line: null,
      hover: null,
      placeholder: null,
      target: null,
    };
  }

  private pointerMove(e: PointerEvent): void {
    const session = this.session;
    if (!session || e.pointerId !== session.pointerId) return;

    if (!session.started) {
      const moved = Math.max(Math.abs(e.clientX - session.startX), Math.abs(e.clientY - session.startY));
      if (moved < DRAG_THRESHOLD_PX) return;
      this.begin(session);
    }

    // Stops the press from also being read as a text selection or a pan.
    e.preventDefault();
    this.updateTarget(session, e.clientY);
  }

  private pointerUp(e: PointerEvent): void {
    const session = this.session;
    if (!session || e.pointerId !== session.pointerId) return;

    const target = session.started ? session.target : null;
    const itemId = session.itemId;
    // A completed drag always swallows its click, target or not: the pointer
    // has travelled, and firing the button's action would be a surprise.
    this.swallowClick = session.started;
    this.cancel();

    if (target) this.host.move(itemId, target.groupId, target.index);
  }

  /**
   * Promote a press into a drag.
   *
   * Capture is taken here rather than on pointerdown on purpose. Capturing
   * retargets the compatibility mouse events too, so a captured press would
   * deliver its `click` to the container instead of the button — which is what
   * a drag wants and what a plain click must not get.
   */
  private begin(session: Session): void {
    session.started = true;
    session.button.addClass('is-rg-dragging');
    this.container?.addClass('ribbon-groups-is-dragging');
    this.container?.setPointerCapture(session.pointerId);
    window.addEventListener('keydown', this.onKeyDown, true);

    // Without an ungrouped block on screen there is nowhere to drop a button
    // that is leaving its group, so give the gesture one to aim at.
    if (!this.host.blocks().some((b) => b.groupId === null)) {
      session.placeholder = this.host.addPlaceholder();
    }

    session.zones = this.measure();
    session.line = createDiv({ cls: 'ribbon-groups-ribbon-line' });

    const own = session.zones.find((z) => z.groupId === session.fromGroupId);
    const at = own ? own.rows.indexOf(session.button) : -1;
    session.fromIndex = at < 0 ? null : at;
  }

  /** Measure every block. The whole wrapper is the hit area, header included. */
  private measure(): ZoneRef[] {
    return this.host.blocks().map((block) => {
      const rows = Array.from(block.slot.querySelectorAll<HTMLElement>(ACTION_SELECTOR));
      return {
        ...block,
        rows,
        zone: {
          groupId: block.groupId,
          rect: measureRect(block.wrapper),
          // A collapsed block draws nothing, so its centres are meaningless
          itemCenters: block.collapsed ? [] : verticalCenters(rows),
          collapsed: block.collapsed,
          count: rows.length,
        },
      };
    });
  }

  private updateTarget(session: Session, y: number): void {
    const target = resolveRibbonDrop(
      session.zones.map((z) => z.zone),
      y,
      session.fromGroupId,
      session.fromIndex
    );
    session.target = target;

    session.hover?.removeClass('is-rg-drop');
    session.hover = null;

    const line = session.line;
    if (!line) return;

    const ref = target ? session.zones.find((z) => z.groupId === target.groupId) : undefined;
    if (!target || !ref) {
      line.remove();
      return;
    }

    ref.wrapper.addClass('is-rg-drop');
    session.hover = ref.wrapper;

    // Two blocks get the highlight and no line, because a line there would
    // promise a position that is not honoured: a collapsed group draws no list
    // to insert into, and the ungrouped block takes its order from Obsidian
    // rather than from the settings — see `moveItem()`, which ignores the index
    // when the target group is null.
    if (ref.collapsed || ref.groupId === null) {
      line.remove();
      return;
    }

    // `target.index` is already adjusted for the button being removed. The line
    // is drawn against the list as it stands right now, so undo that here.
    const visual =
      session.fromIndex !== null && ref.groupId === session.fromGroupId && target.index >= session.fromIndex
        ? target.index + 1
        : target.index;

    const before = ref.rows[visual];
    if (before) ref.slot.insertBefore(line, before);
    else ref.slot.appendChild(line);
  }
}
