import { useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { ComposerSelectMenu } from './composer-select-menu';
import { ComposerSelectTriggerButton } from './composer-select-trigger-button';
import type { ComposerSelectProps } from './composer-select.types';
export type { ComposerSelectOption, ComposerSelectProps } from './composer-select.types';
import { useComposerSelectPlacement } from './use-composer-select-placement';
import { MotionPresenceView } from './motion-ui';

/**
 * Composer 底部控制行用的受控单选下拉原语。
 *
 * 当前实现统一使用原生 button trigger，与共享菜单链路组合成可复用的
 * primary / compact selector 轨道。
 */
export function ComposerSelect({
  label,
  value,
  disabled,
  open,
  onOpenChange,
  options,
  selectedId,
  onSelect,
  testId,
  triggerId,
  containerClassName,
  leadingIcon,
  menuClassName,
}: ComposerSelectProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const chipBodyRef = useRef<HTMLSpanElement | null>(null);
  const chipValueRef = useRef<HTMLSpanElement | null>(null);
  const chipArrowRef = useRef<HTMLSpanElement | null>(null);
  const menuPlacement = useComposerSelectPlacement({
    open,
    optionsLength: options.length,
    label,
    value,
    selectedId,
    testId,
    chipRef,
    chipBodyRef,
    chipValueRef,
    chipArrowRef,
  });
  const portalContainer = chipRef.current?.closest('.panel') as HTMLElement | null;

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

  const handleMenuClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  return (
    <div className={containerClassName ?? 'cmp-select'}>
      <ComposerSelectTriggerButton
        label={label}
        value={value}
        disabled={disabled}
        open={open}
        testId={testId}
        triggerId={triggerId}
        leadingIcon={leadingIcon}
        chipRef={chipRef}
        chipBodyRef={chipBodyRef}
        chipValueRef={chipValueRef}
        chipArrowRef={chipArrowRef}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
      />
      <MotionPresenceView visible={open} kind="popover">
        {({ ref, state }) => {
          const menu = (
            <ComposerSelectMenu
              label={label}
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
              onClose={() => onOpenChange(false)}
              onClick={handleMenuClick}
              portaled={portalContainer !== null}
            />
          );
          return portalContainer ? createPortal(menu, portalContainer) : menu;
        }}
      </MotionPresenceView>
    </div>
  );
}
