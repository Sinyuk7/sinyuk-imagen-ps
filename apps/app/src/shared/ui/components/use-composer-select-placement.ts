import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { ComposerSelectMenuPlacement } from './composer-select.types';

const DEBUG_COMPOSER_SELECT_QUERY = 'debugComposerSelect';
const PANEL_EDGE_PADDING = 12;
const MENU_GAP = 6;
const MENU_ITEM_ESTIMATE = 34;
const MENU_MAX_VISIBLE_ITEMS = 6;
const MENU_MIN_HEIGHT = 96;
const MENU_MIN_WIDTH = 132;
const MENU_MAX_WIDTH = 260;

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function finiteOrFallback(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function shouldDebugComposerSelectLayout(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get(DEBUG_COMPOSER_SELECT_QUERY) === '1') {
    return true;
  }
  try {
    return window.localStorage.getItem(DEBUG_COMPOSER_SELECT_QUERY) === '1';
  } catch {
    return false;
  }
}

function resolveComposerSelectKind(testId?: string, label?: string): string {
  const hint = `${testId ?? ''} ${label ?? ''}`.toLowerCase();
  if (hint.includes('model')) return 'model';
  if (hint.includes('target')) return 'target';
  if (hint.includes('aspect')) return 'aspect';
  if (hint.includes('ratio')) return 'aspect';
  return testId ?? label ?? 'composer-select';
}

function scrollParentsFor(element: HTMLElement, boundary: HTMLElement): readonly HTMLElement[] {
  const parents: HTMLElement[] = [];
  let current = element.parentElement;
  while (current && current !== boundary) {
    parents.push(current);
    current = current.parentElement;
  }
  if (current === boundary) {
    parents.push(boundary);
  }
  return parents;
}

function rectDimension(value: number, fallback: number): number {
  return value > 0 ? value : fallback;
}

interface UseComposerSelectPlacementOptions {
  readonly open: boolean;
  readonly optionsLength: number;
  readonly label: string;
  readonly value: string;
  readonly selectedId: string;
  readonly testId?: string;
  readonly anchorRef: RefObject<HTMLElement | null>;
  readonly popupRoot: HTMLElement | null;
  readonly menuRef: RefObject<HTMLElement | null>;
  readonly scrollBoundaryRef: RefObject<HTMLElement | null>;
  readonly onInvalidAnchor?: () => void;
  readonly chipBodyRef: RefObject<HTMLSpanElement | null>;
  readonly chipValueRef: RefObject<HTMLSpanElement | null>;
  readonly chipArrowRef: RefObject<HTMLSpanElement | null>;
}

export function useComposerSelectPlacement({
  open,
  optionsLength,
  label,
  value,
  selectedId,
  testId,
  anchorRef,
  popupRoot,
  menuRef,
  scrollBoundaryRef,
  onInvalidAnchor,
  chipBodyRef,
  chipValueRef,
  chipArrowRef,
}: UseComposerSelectPlacementOptions): ComposerSelectMenuPlacement {
  const scheduledFrameRef = useRef<number | null>(null);
  const hasMeasuredRef = useRef(false);
  const [menuPlacement, setMenuPlacement] = useState<ComposerSelectMenuPlacement>({
    direction: 'down',
    align: 'start',
    width: MENU_MIN_WIDTH,
    maxHeight: MENU_ITEM_ESTIMATE * MENU_MAX_VISIBLE_ITEMS,
    ready: false,
  });

  const updateMenuPlacement = useCallback(() => {
    const anchor = anchorRef.current;
    const root = popupRoot ?? (anchor?.closest('.panel') as HTMLElement | null);
    if (!anchor || !root) {
      if (hasMeasuredRef.current) {
        onInvalidAnchor?.();
      }
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    if (rootRect.width <= 0 || rootRect.height <= 0 || anchorRect.width <= 0 || anchorRect.height <= 0) {
      if (hasMeasuredRef.current) {
        onInvalidAnchor?.();
      }
      return;
    }
    hasMeasuredRef.current = true;

    const viewportWidth = typeof window === 'undefined'
      ? rootRect.right
      : finiteOrFallback(window.innerWidth, rootRect.right);
    const viewportHeight = typeof window === 'undefined'
      ? rootRect.bottom
      : finiteOrFallback(window.innerHeight, rootRect.bottom);
    const boundaryLeft = Math.max(rootRect.left + PANEL_EDGE_PADDING, PANEL_EDGE_PADDING);
    const boundaryTop = Math.max(rootRect.top + PANEL_EDGE_PADDING, PANEL_EDGE_PADDING);
    const boundaryRight = Math.min(rootRect.right - PANEL_EDGE_PADDING, viewportWidth - PANEL_EDGE_PADDING);
    const boundaryBottom = Math.min(rootRect.bottom - PANEL_EDGE_PADDING, viewportHeight - PANEL_EDGE_PADDING);
    const availableWidth = Math.max(0, boundaryRight - boundaryLeft);
    const minWidth = Math.min(MENU_MIN_WIDTH, availableWidth);
    const measuredMenuRect = menuRef.current?.getBoundingClientRect();
    const measuredMenuWidth = rectDimension(measuredMenuRect?.width ?? 0, anchorRect.width);
    const measuredMenuHeight = rectDimension(
      measuredMenuRect?.height ?? 0,
      Math.min(MENU_ITEM_ESTIMATE * Math.max(1, Math.min(optionsLength, MENU_MAX_VISIBLE_ITEMS)), MENU_ITEM_ESTIMATE * MENU_MAX_VISIBLE_ITEMS),
    );
    const preferredWidth = Math.max(anchorRect.width, Math.min(MENU_MAX_WIDTH, Math.max(measuredMenuWidth, minWidth)));
    const width = clampNumber(preferredWidth, minWidth, availableWidth);
    const spaceAbove = anchorRect.top - boundaryTop - MENU_GAP;
    const spaceBelow = boundaryBottom - anchorRect.bottom - MENU_GAP;
    const canFitBelow = measuredMenuHeight <= spaceBelow;
    const canFitAbove = measuredMenuHeight <= spaceAbove;
    const direction = canFitBelow || (!canFitAbove && spaceBelow >= spaceAbove) ? 'down' : 'up';
    const verticalSpace = Math.max(direction === 'down' ? spaceBelow : spaceAbove, 48);
    const maxHeight = clampNumber(
      verticalSpace,
      48,
      Math.max(MENU_MIN_HEIGHT, MENU_ITEM_ESTIMATE * MENU_MAX_VISIBLE_ITEMS, measuredMenuHeight),
    );
    const spaceToRight = boundaryRight - anchorRect.left;
    const spaceToLeft = anchorRect.right - boundaryLeft;
    const preferredAlign = spaceToRight >= width || spaceToRight >= spaceToLeft ? 'start' : 'end';
    const preferredLeft = preferredAlign === 'start' ? anchorRect.left : anchorRect.right - width;
    const clampedLeft = clampNumber(preferredLeft, boundaryLeft, Math.max(boundaryLeft, boundaryRight - width));
    const align = preferredAlign;
    const left = align === 'start' ? clampedLeft - rootRect.left : undefined;
    const right = align === 'end' ? rootRect.right - (clampedLeft + width) : undefined;
    const top = direction === 'down' ? anchorRect.bottom - rootRect.top + MENU_GAP : undefined;
    const bottom = direction === 'up' ? rootRect.bottom - anchorRect.top + MENU_GAP : undefined;

    setMenuPlacement((current) => {
      if (
        current.ready &&
        current.direction === direction &&
        current.align === align &&
        Math.round(current.width) === Math.round(width) &&
        Math.round(current.maxHeight) === Math.round(maxHeight) &&
        Math.round(current.top ?? -1) === Math.round(top ?? -1) &&
        Math.round(current.bottom ?? -1) === Math.round(bottom ?? -1) &&
        Math.round(current.left ?? -1) === Math.round(left ?? -1) &&
        Math.round(current.right ?? -1) === Math.round(right ?? -1)
      ) {
        return current;
      }
      return { direction, align, width, maxHeight, ready: true, top, bottom, left, right };
    });
  }, [anchorRef, menuRef, onInvalidAnchor, optionsLength, popupRoot]);

  const scheduleMenuPlacement = useCallback(() => {
    if (scheduledFrameRef.current !== null) {
      return;
    }
    scheduledFrameRef.current = window.requestAnimationFrame(() => {
      scheduledFrameRef.current = null;
      updateMenuPlacement();
    });
  }, [updateMenuPlacement]);

  useEffect(() => {
    if (open) {
      scheduleMenuPlacement();
    }
  }, [open, scheduleMenuPlacement]);

  useLayoutEffect(() => {
    if (!open) {
      hasMeasuredRef.current = false;
      if (scheduledFrameRef.current !== null) {
        window.cancelAnimationFrame(scheduledFrameRef.current);
        scheduledFrameRef.current = null;
      }
      setMenuPlacement((current) => (current.ready ? { ...current, ready: false } : current));
      return undefined;
    }

    updateMenuPlacement();
    const firstFrame = window.requestAnimationFrame(updateMenuPlacement);
    const secondFrame = window.requestAnimationFrame(scheduleMenuPlacement);
    window.addEventListener('resize', scheduleMenuPlacement);
    const anchor = anchorRef.current;
    const root = popupRoot ?? (anchor?.closest('.panel') as HTMLElement | null);
    const scrollBoundary = scrollBoundaryRef.current ?? root;
    const scrollParents = anchor && scrollBoundary ? scrollParentsFor(anchor, scrollBoundary) : [];
    for (const parent of scrollParents) {
      parent.addEventListener('scroll', scheduleMenuPlacement);
    }

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(scheduleMenuPlacement);
      if (anchor) observer.observe(anchor);
      if (root) observer.observe(root);
      if (menuRef.current) observer.observe(menuRef.current);
    }

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      if (scheduledFrameRef.current !== null) {
        window.cancelAnimationFrame(scheduledFrameRef.current);
        scheduledFrameRef.current = null;
      }
      window.removeEventListener('resize', scheduleMenuPlacement);
      for (const parent of scrollParents) {
        parent.removeEventListener('scroll', scheduleMenuPlacement);
      }
      observer?.disconnect();
    };
  }, [anchorRef, menuRef, open, optionsLength, popupRoot, scheduleMenuPlacement, scrollBoundaryRef, selectedId, updateMenuPlacement, value]);

  useLayoutEffect(() => {
    if (!shouldDebugComposerSelectLayout()) {
      return undefined;
    }

    const measureAndLog = () => {
      const anchor = anchorRef.current;
      const chipBody = chipBodyRef.current;
      const chipValue = chipValueRef.current;
      const chipArrow = chipArrowRef.current;
      if (!anchor || !chipBody || !chipValue || !chipArrow) {
        return;
      }

      const anchorRect = anchor.getBoundingClientRect();
      const bodyRect = chipBody.getBoundingClientRect();
      const valueRect = chipValue.getBoundingClientRect();
      const arrowRect = chipArrow.getBoundingClientRect();
      const kind = resolveComposerSelectKind(testId, label);

      console.info(`[ComposerSelect:${kind}]`, {
        testId,
        label,
        value,
        selectedId,
        open,
        container: {
          width: Math.round(anchorRect.width),
          height: Math.round(anchorRect.height),
        },
        body: {
          left: Math.round(bodyRect.left - anchorRect.left),
          right: Math.round(anchorRect.right - bodyRect.right),
          top: Math.round(bodyRect.top - anchorRect.top),
          bottom: Math.round(anchorRect.bottom - bodyRect.bottom),
          width: Math.round(bodyRect.width),
          height: Math.round(bodyRect.height),
        },
        text: {
          left: Math.round(valueRect.left - anchorRect.left),
          right: Math.round(anchorRect.right - valueRect.right),
          top: Math.round(valueRect.top - anchorRect.top),
          bottom: Math.round(anchorRect.bottom - valueRect.bottom),
          width: Math.round(valueRect.width),
          height: Math.round(valueRect.height),
        },
        arrow: {
          left: Math.round(arrowRect.left - anchorRect.left),
          right: Math.round(anchorRect.right - arrowRect.right),
          top: Math.round(arrowRect.top - anchorRect.top),
          bottom: Math.round(anchorRect.bottom - arrowRect.bottom),
          width: Math.round(arrowRect.width),
          height: Math.round(arrowRect.height),
        },
      });
    };

    measureAndLog();

    window.addEventListener('resize', measureAndLog);

    return () => {
      window.removeEventListener('resize', measureAndLog);
    };
  }, [anchorRef, chipArrowRef, chipBodyRef, chipValueRef, label, open, selectedId, testId, value]);

  return menuPlacement;
}
