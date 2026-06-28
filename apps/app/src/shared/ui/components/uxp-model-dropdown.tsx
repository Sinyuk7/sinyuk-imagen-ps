import { useEffect, useRef } from 'react';

interface UxpModelDropdownOption {
  readonly id: string;
  readonly label: string;
}

interface UxpModelDropdownProps {
  readonly value: string;
  readonly options: readonly UxpModelDropdownOption[];
  readonly placeholder: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly testId?: string;
  readonly onValue: (value: string) => void;
}

type DropdownElement = HTMLElement & {
  value?: string;
  selectedIndex?: number;
  disabled?: boolean;
  placeholder?: string;
};

/**
 * Photoshop UXP 原生 `sp-dropdown` 薄封装。
 *
 * 只服务 provider detail 的 default model spike：页面层继续走受控 value/onValue，
 * 原生 change 事件留在 shared seam 内处理，避免 page 直接绑定 host-level 表单事件。
 */
export function UxpModelDropdown({
  value,
  options,
  placeholder,
  disabled,
  className,
  testId,
  onValue,
}: UxpModelDropdownProps) {
  const controlRef = useRef<DropdownElement | null>(null);
  const selectedIndex = options.findIndex((option) => option.id === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  useEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return;
    }
    control.value = selectedOption?.label ?? '';
    control.selectedIndex = selectedIndex;
    control.placeholder = placeholder;
    control.disabled = Boolean(disabled);
  }, [disabled, placeholder, selectedIndex, selectedOption]);

  useEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return;
    }
    const syncFromEvent = (event: Event) => {
      const target = event.currentTarget as DropdownElement | null;
      onValue(String(target?.value ?? ''));
    };
    control.addEventListener('change', syncFromEvent);
    return () => control.removeEventListener('change', syncFromEvent);
  }, [onValue]);

  return (
    <sp-dropdown
      ref={controlRef}
      class={className}
      data-testid={testId}
      placeholder={placeholder}
      disabled={disabled || undefined}
    >
      <sp-menu slot="options" selects="single" value={value}>
        {options.map((option) => (
          <sp-menu-item key={option.id} value={option.id} selected={option.id === value}>
            {option.label}
          </sp-menu-item>
        ))}
      </sp-menu>
    </sp-dropdown>
  );
}
