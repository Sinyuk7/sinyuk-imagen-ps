import { useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { ComposerSelectMenu } from './composer-select-menu';
import { ComposerSelectTrigger } from './composer-select-trigger';
import type { ComposerSelectProps } from './composer-select.types';
export type { ComposerSelectOption, ComposerSelectProps } from './composer-select.types';
import { useComposerSelectPlacement } from './use-composer-select-placement';

/**
 * Composer 底部控制行用的受控单选下拉原语。
 *
 * 当前实现使用项目内原生元素承载触发器与菜单：
 * content lane 负责图标与可截断文本，chevron/check lane 独立保留点击和
 * 选中语义。后续排查与修改都应以这条受控 open/menu 链路为准。
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
  trailingIcon = 'chevron-down',
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

  const handleTriggerClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    if (disabled) return;
    onOpenChange(!open);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
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
      <ComposerSelectTrigger
        label={label}
        value={value}
        disabled={disabled}
        open={open}
        testId={testId}
        leadingIcon={leadingIcon}
        trailingIcon={trailingIcon}
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
