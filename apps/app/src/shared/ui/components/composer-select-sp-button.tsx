import { useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { ComposerSelectMenu } from './composer-select-menu';
import { ComposerSelectTriggerSpButton } from './composer-select-trigger-sp-button';
import type { ComposerSelectProps } from './composer-select.types';
export type { ComposerSelectOption, ComposerSelectProps } from './composer-select.types';
import { useComposerSelectPlacement } from './use-composer-select-placement';

/**
 * Photoshop UXP 对比用的 `sp-button` 版 select trigger。
 *
 * 保留原菜单与 placement 链路，只替换 trigger primitive，便于直接比较
 * native button 和 wrapper-safe `sp-button` 在 PS host 里的图标可见性差异。
 */
export function ComposerSelectSpButton({
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
