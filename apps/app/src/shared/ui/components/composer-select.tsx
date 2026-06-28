import { useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { ComposerSelectMenu } from './composer-select-menu';
import { ComposerSelectTriggerSpButton } from './composer-select-trigger-sp-button';
import type { ComposerSelectProps } from './composer-select.types';
export type { ComposerSelectOption, ComposerSelectProps } from './composer-select.types';
import { useComposerSelectPlacement } from './use-composer-select-placement';

/**
 * Composer 底部控制行用的受控单选下拉原语。
 *
 * 当前实现统一使用 wrapper-safe `sp-button` 承载 trigger，与共享菜单链路
 * 组合成可复用的 primary / compact selector 轨道。
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
  containerClassName,
  leadingIcon,
  menuClassName,
}: ComposerSelectProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const chipRef = useRef<HTMLElement | null>(null);
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
      <ComposerSelectTriggerSpButton
        label={label}
        value={value}
        disabled={disabled}
        open={open}
        testId={testId}
        leadingIcon={leadingIcon}
        chipRef={chipRef}
        chipBodyRef={chipBodyRef}
        chipValueRef={chipValueRef}
        chipArrowRef={chipArrowRef}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
      />
      {open && (
        <ComposerSelectMenu
          label={label}
          testId={testId}
          menuRef={menuRef}
          menuClassName={menuClassName}
          menuPlacement={menuPlacement}
          options={options}
          selectedId={selectedId}
          onSelect={selectValue}
          onClose={() => onOpenChange(false)}
          onClick={handleMenuClick}
        />
      )}
    </div>
  );
}
