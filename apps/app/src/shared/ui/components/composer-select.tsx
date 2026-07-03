import { useRef, type KeyboardEvent, type MouseEvent } from 'react';
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
    testId,
    triggerId,
    containerClassName,
    menuClassName,
  } = props;
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
      {props.triggerKind === 'icon' ? (
        <IconSelectTriggerButton
          label={label}
          value={value}
          disabled={disabled}
          open={open}
          testId={testId}
          triggerId={triggerId}
          icon={props.leadingIcon}
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
          return (
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
              floating={true}
            />
          );
        }}
      </MotionPresenceView>
    </div>
  );
}
