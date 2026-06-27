import { useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { ComposerSelectMenu } from './composer-select-menu';
import { ComposerSelectTrigger } from './composer-select-trigger';
import type { ComposerSelectProps } from './composer-select.types';
export type { ComposerSelectOption, ComposerSelectProps } from './composer-select.types';
import { useComposerSelectPlacement } from './use-composer-select-placement';

/**
 * Composer 底部控制行用的受控单选下拉原语。
 *
 * 触发器和菜单都使用项目内原生元素承载稳定的窄面板 picker 布局：
 * content lane 负责图标与可截断文本，chevron/check lane 独立保留点击和
 * 选中语义。这里不使用 SWC picker/action-menu，因为当前 UXP wrapper 合同
 * 不覆盖这些组件，且 shadow 布局会干扰窄面板截断。
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
