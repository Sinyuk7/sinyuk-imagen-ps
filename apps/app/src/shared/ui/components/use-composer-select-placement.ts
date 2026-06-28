import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
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

interface UseComposerSelectPlacementOptions {
  readonly open: boolean;
  readonly optionsLength: number;
  readonly label: string;
  readonly value: string;
  readonly selectedId: string;
  readonly testId?: string;
  readonly chipRef: RefObject<HTMLElement | null>;
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
  chipRef,
  chipBodyRef,
  chipValueRef,
  chipArrowRef,
}: UseComposerSelectPlacementOptions): ComposerSelectMenuPlacement {
  const [menuPlacement, setMenuPlacement] = useState<ComposerSelectMenuPlacement>({
    direction: 'up',
    align: 'start',
    width: MENU_MIN_WIDTH,
    maxHeight: MENU_ITEM_ESTIMATE * MENU_MAX_VISIBLE_ITEMS,
  });

  const updateMenuPlacement = () => {
    const chip = chipRef.current;
    if (!chip) {
      return;
    }
    const panel = chip.closest('.panel') as HTMLElement | null;
    const panelRect = panel?.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    if (!panelRect || panelRect.width <= 0 || panelRect.height <= 0) {
      return;
    }

    const viewportWidth = typeof window === 'undefined' ? panelRect.width : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? panelRect.height : window.innerHeight;
    const horizontalBoundaryLeft = Math.max(panelRect.left, PANEL_EDGE_PADDING);
    const horizontalBoundaryRight = Math.min(panelRect.right, viewportWidth - PANEL_EDGE_PADDING);
    const availableWidth = Math.max(0, horizontalBoundaryRight - horizontalBoundaryLeft);
    const minWidth = Math.min(MENU_MIN_WIDTH, availableWidth);
    const preferredWidth = Math.max(chipRect.width, Math.min(MENU_MAX_WIDTH, availableWidth));
    const width = clampNumber(preferredWidth, minWidth, availableWidth);
    const spaceAbove = chipRect.top - PANEL_EDGE_PADDING - MENU_GAP;
    const spaceBelow = viewportHeight - chipRect.bottom - PANEL_EDGE_PADDING - MENU_GAP;
    const direction = spaceBelow >= MENU_MIN_HEIGHT || spaceBelow >= spaceAbove ? 'down' : 'up';
    const verticalSpace = Math.max(direction === 'down' ? spaceBelow : spaceAbove, 48);
    const maxHeight = clampNumber(verticalSpace, 48, MENU_ITEM_ESTIMATE * MENU_MAX_VISIBLE_ITEMS);
    const spaceToRight = horizontalBoundaryRight - chipRect.left;
    const spaceToLeft = chipRect.right - horizontalBoundaryLeft;
    const align = spaceToRight >= width || spaceToRight >= spaceToLeft ? 'start' : 'end';

    setMenuPlacement((current) => {
      if (
        current.direction === direction &&
        current.align === align &&
        Math.round(current.width) === Math.round(width) &&
        Math.round(current.maxHeight) === Math.round(maxHeight)
      ) {
        return current;
      }
      return { direction, align, width, maxHeight };
    });
  };

  useEffect(() => {
    if (open) {
      updateMenuPlacement();
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      return undefined;
    }

    updateMenuPlacement();
    window.addEventListener('resize', updateMenuPlacement);

    return () => {
      window.removeEventListener('resize', updateMenuPlacement);
    };
  }, [open, optionsLength]);

  useLayoutEffect(() => {
    if (!shouldDebugComposerSelectLayout()) {
      return undefined;
    }

    const measureAndLog = () => {
      const chip = chipRef.current;
      const chipBody = chipBodyRef.current;
      const chipValue = chipValueRef.current;
      const chipArrow = chipArrowRef.current;
      if (!chip || !chipBody || !chipValue || !chipArrow) {
        return;
      }

      const chipRect = chip.getBoundingClientRect();
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
          width: Math.round(chipRect.width),
          height: Math.round(chipRect.height),
        },
        body: {
          left: Math.round(bodyRect.left - chipRect.left),
          right: Math.round(chipRect.right - bodyRect.right),
          top: Math.round(bodyRect.top - chipRect.top),
          bottom: Math.round(chipRect.bottom - bodyRect.bottom),
          width: Math.round(bodyRect.width),
          height: Math.round(bodyRect.height),
        },
        text: {
          left: Math.round(valueRect.left - chipRect.left),
          right: Math.round(chipRect.right - valueRect.right),
          top: Math.round(valueRect.top - chipRect.top),
          bottom: Math.round(chipRect.bottom - valueRect.bottom),
          width: Math.round(valueRect.width),
          height: Math.round(valueRect.height),
        },
        arrow: {
          left: Math.round(arrowRect.left - chipRect.left),
          right: Math.round(chipRect.right - arrowRect.right),
          top: Math.round(arrowRect.top - chipRect.top),
          bottom: Math.round(chipRect.bottom - arrowRect.bottom),
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
  }, [chipArrowRef, chipBodyRef, chipRef, chipValueRef, label, open, selectedId, testId, value]);

  return menuPlacement;
}
