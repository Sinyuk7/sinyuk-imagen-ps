import type { KeyboardEvent, MouseEvent, PointerEvent, RefObject } from 'react';
import { Icon } from './icons';
import type { ComposerSelectMenuPlacement, ComposerSelectOption } from './composer-select.types';

interface ComposerSelectMenuProps {
  readonly label: string;
  readonly menuId: string;
  readonly testId?: string;
  readonly visible: boolean;
  readonly menuRef: RefObject<HTMLDivElement | null>;
  readonly motionRef?: (element: HTMLElement | null) => void;
  readonly motionState?: string;
  readonly menuClassName?: string;
  readonly menuPlacement: ComposerSelectMenuPlacement;
  readonly options: readonly ComposerSelectOption[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
  readonly isOptionSelectable?: (id: string) => boolean;
  readonly onClose: () => void;
  readonly onClick: (event: MouseEvent<HTMLElement>) => void;
  readonly portaled?: boolean;
}

export function ComposerSelectMenu({
  label,
  menuId,
  testId,
  visible,
  menuRef,
  motionRef,
  motionState,
  menuClassName,
  menuPlacement,
  options,
  selectedId,
  onSelect,
  isOptionSelectable,
  onClose,
  onClick,
  portaled = false,
}: ComposerSelectMenuProps) {
  const placementClass = [
    menuClassName ?? 'cmp-select-menu',
    portaled ? 'cmp-select-menu-portal' : '',
    `cmp-select-menu-${menuPlacement.direction}`,
    `cmp-select-menu-${menuPlacement.align}`,
  ].join(' ');

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? []);
      if (items.length === 0) {
        return;
      }
      const currentIndex = Math.max(0, items.findIndex((item) => item === document.activeElement));
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = (currentIndex + delta + items.length) % items.length;
      items[nextIndex]?.focus();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const id = active?.getAttribute('data-value');
    if (!id) {
      return;
    }
    if ((active as HTMLButtonElement).disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onSelect(id);
  };

  const handlePressStart = (event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>) => {
    event.nativeEvent.stopImmediatePropagation?.();
    event.stopPropagation();
  };

  return (
    <div
      data-testid={testId ? `${testId}-popover` : undefined}
      className={placementClass}
      data-motion-state={motionState}
      aria-hidden={motionState === 'exiting' ? true : undefined}
      style={{
        width: `${Math.round(menuPlacement.width)}px`,
        maxHeight: `${Math.round(menuPlacement.maxHeight)}px`,
        top: menuPlacement.top !== undefined ? `${Math.round(menuPlacement.top)}px` : undefined,
        bottom: menuPlacement.bottom !== undefined ? `${Math.round(menuPlacement.bottom)}px` : undefined,
        left: menuPlacement.left !== undefined ? `${Math.round(menuPlacement.left)}px` : undefined,
        right: menuPlacement.right !== undefined ? `${Math.round(menuPlacement.right)}px` : undefined,
        visibility: menuPlacement.ready ? undefined : 'hidden',
        pointerEvents: motionState === 'exiting' ? 'none' : undefined,
      }}
      onClick={onClick}
      onMouseDown={handlePressStart}
      onPointerDown={handlePressStart}
    >
      <div
        ref={motionRef}
        className="cmp-select-menu-motion"
        data-motion-state={motionState}
        aria-hidden={motionState === 'exiting' ? true : undefined}
      >
        <div
          id={menuId}
          ref={menuRef}
          data-testid={visible && testId ? `${testId}-menu` : undefined}
          className="cmp-select-listbox"
          role="listbox"
          aria-label={label}
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          {options.map((option) => {
            const selected = option.id === selectedId;
            const selectable = isOptionSelectable ? isOptionSelectable(option.id) : true;
            return (
              <button
                key={option.id}
                type="button"
                data-testid={testId ? `${testId}-option-${option.id}` : undefined}
                data-value={option.id}
                className={`cmp-select-option${selected ? ' selected' : ''}${!selectable ? ' disabled' : ''}`}
                role="option"
                aria-selected={selected}
                aria-disabled={!selectable ? true : undefined}
                onMouseDown={handlePressStart}
                onPointerDown={handlePressStart}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(option.id);
                }}
              >
                {option.icon && <Icon name={option.icon} size={14} className="cmp-select-option-icon" />}
                <span className="cmp-select-option-body">
                  <span className="cmp-select-option-label">{option.label}</span>
                </span>
                {option.badges?.length ? (
                  <span className="cmp-select-option-badges">
                    {option.badges.map((badge) => <span key={badge} className="cmp-select-option-badge">{badge}</span>)}
                  </span>
                ) : null}
                {selected && <Icon name="check" size={12} className="cmp-select-option-check" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
