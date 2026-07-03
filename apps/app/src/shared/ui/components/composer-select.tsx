import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { ComposerSelectMenu } from './composer-select-menu';
import { IconSelectTriggerButton } from './icon-select-trigger-button';
import { TextSelectTriggerButton } from './text-select-trigger-button';
import type { ComposerSelectProps } from './composer-select.types';
export type {
  ComposerSelectOption,
  ComposerSelectProps,
  IconComposerSelectProps,
  TextComposerSelectProps,
} from './composer-select.types';
import { useComposerSelectPlacement } from './use-composer-select-placement';
import { MotionPresenceView } from './motion-ui';
import { usePopupLayer } from './popup-layer';

interface ComposerSelectUnderlayProps {
  readonly testId?: string;
  readonly onClose: () => void;
}

function ComposerSelectUnderlay({ testId, onClose }: ComposerSelectUnderlayProps) {
  const stop = (event: MouseEvent<HTMLDivElement> | WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
  };
  const close = (event: MouseEvent<HTMLDivElement>) => {
    stop(event);
    onClose();
  };

  return (
    <div
      data-testid={testId ? `${testId}-underlay` : undefined}
      className="cmp-select-underlay"
      onPointerDownCapture={stop}
      onMouseDownCapture={stop}
      onWheelCapture={stop}
      onContextMenuCapture={close}
      onClickCapture={close}
    />
  );
}

/**
 * Composer 底部控制行用的受控单选下拉原语。
 *
 * 当前实现统一使用原生 button trigger，与共享菜单链路组合成可复用的
 * primary / compact selector 轨道。
 */
export function ComposerSelect(props: ComposerSelectProps) {
  const {
    label,
    value,
    disabled,
    open,
    onOpenChange,
    options,
    selectedId,
    onSelect,
    isOptionSelectable,
    testId,
    triggerId,
    containerClassName,
    menuClassName,
  } = props;
  const menuRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const panelBoundaryRef = useRef<HTMLElement | null>(null);
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const chipBodyRef = useRef<HTMLSpanElement | null>(null);
  const chipValueRef = useRef<HTMLSpanElement | null>(null);
  const chipArrowRef = useRef<HTMLSpanElement | null>(null);
  const popupRootReadyRef = useRef(false);
  const wasOpenRef = useRef(open);
  const [fallbackPortalRoot, setFallbackPortalRoot] = useState<HTMLElement | null>(null);
  const popupLayer = usePopupLayer();
  const popupRoot = popupLayer?.root ?? null;
  const portalRoot = popupRoot ?? fallbackPortalRoot;
  const fallbackMenuId = useId();
  const menuId = triggerId ? `${triggerId}-menu` : `${fallbackMenuId}-menu`;
  const popupId = triggerId ?? testId ?? fallbackMenuId;
  const closeForInvalidAnchor = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);
  const menuPlacement = useComposerSelectPlacement({
    open,
    optionsLength: options.length,
    label,
    value,
    selectedId,
    testId,
    anchorRef: hostRef,
    popupRoot,
    menuRef,
    scrollBoundaryRef: panelBoundaryRef,
    onInvalidAnchor: closeForInvalidAnchor,
    chipBodyRef,
    chipValueRef,
    chipArrowRef,
  });

  const handleTriggerClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    if (disabled) return;
    onOpenChange(!open);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(true);
    }
    if (event.key === 'Escape') {
      event.stopPropagation();
      onOpenChange(false);
    }
  };

  const selectValue = (id: string) => {
    if (id) {
      onSelect(id);
    }
    onOpenChange(false);
  };

  const closeAndReturnFocus = () => {
    onOpenChange(false);
    chipRef.current?.focus();
  };

  useEffect(() => {
    if (!open) {
      popupLayer?.releaseActivePopup(popupId);
      return undefined;
    }
    popupLayer?.requestActivePopup(popupId);
    return () => {
      popupLayer?.releaseActivePopup(popupId);
    };
  }, [open, popupId, popupLayer]);

  useEffect(() => {
    const openedThisCommit = open && !wasOpenRef.current;
    if (open && !openedThisCommit && popupLayer?.activePopupId && popupLayer.activePopupId !== popupId) {
      onOpenChange(false);
    }
    wasOpenRef.current = open;
  }, [onOpenChange, open, popupId, popupLayer?.activePopupId]);

  useLayoutEffect(() => {
    const panel = hostRef.current?.closest('.panel') as HTMLElement | null;
    panelBoundaryRef.current = panel;
    if (!popupLayer) {
      setFallbackPortalRoot((current) => (current === panel ? current : panel));
    }
  }, [popupRoot]);

  useEffect(() => {
    if (popupRoot) {
      popupRootReadyRef.current = true;
    }
    if (open && (disabled || options.length === 0 || !hostRef.current || (popupLayer && popupRootReadyRef.current && !popupRoot))) {
      onOpenChange(false);
    }
  }, [disabled, onOpenChange, open, options.length, popupLayer, popupRoot]);

  const handleMenuClick = (event: MouseEvent<HTMLElement>) => {
    event.nativeEvent.stopImmediatePropagation();
    event.stopPropagation();
  };

  return (
    <div className={containerClassName ?? 'cmp-select'}>
      {props.triggerKind === 'icon' ? (
        <IconSelectTriggerButton
          label={label}
          value={value}
          disabled={disabled}
          open={open}
          testId={testId}
          triggerId={triggerId}
          menuId={menuId}
          icon={props.leadingIcon}
          hostRef={hostRef}
          chipRef={chipRef}
          chipBodyRef={chipBodyRef}
          chipValueRef={chipValueRef}
          chipArrowRef={chipArrowRef}
          onClick={handleTriggerClick}
          onKeyDown={handleTriggerKeyDown}
        />
      ) : (
        <TextSelectTriggerButton
          label={label}
          value={value}
          disabled={disabled}
          open={open}
          testId={testId}
          triggerId={triggerId}
          menuId={menuId}
          hostRef={hostRef}
          chipRef={chipRef}
          chipBodyRef={chipBodyRef}
          chipValueRef={chipValueRef}
          chipArrowRef={chipArrowRef}
          onClick={handleTriggerClick}
          onKeyDown={handleTriggerKeyDown}
        />
      )}
      <MotionPresenceView visible={open} kind="popover">
        {({ ref, state }) => {
          const menu = (
            <>
              {portalRoot ? (
                <ComposerSelectUnderlay testId={testId} onClose={closeAndReturnFocus} />
              ) : null}
              <ComposerSelectMenu
                label={label}
                menuId={menuId}
                testId={testId}
                visible={open}
                menuRef={menuRef}
                motionRef={ref}
                motionState={state}
                menuClassName={menuClassName}
                menuPlacement={menuPlacement}
                options={options}
                selectedId={selectedId}
                onSelect={selectValue}
                isOptionSelectable={isOptionSelectable}
                onClose={closeAndReturnFocus}
                onClick={handleMenuClick}
                portaled={portalRoot !== null}
              />
            </>
          );
          return portalRoot ? createPortal(menu, portalRoot) : menu;
        }}
      </MotionPresenceView>
    </div>
  );
}
