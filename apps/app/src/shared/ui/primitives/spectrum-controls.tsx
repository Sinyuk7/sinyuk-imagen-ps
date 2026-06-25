import { useCallback, useEffect, useRef, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { Button as SpectrumButton } from '@spectrum-web-components/button';
import { Checkbox as SpectrumCheckbox } from '@spectrum-web-components/checkbox';
import { Textfield as SpectrumTextfield } from '@spectrum-web-components/textfield';

type SpectrumButtonVariant = 'accent' | 'primary' | 'secondary' | 'negative';
type SpectrumTextFieldType = 'text' | 'password' | 'url' | 'search';

type SpectrumElement = HTMLElement & {
  disabled?: boolean;
  checked?: boolean;
  value?: string;
  type?: string;
  placeholder?: string;
};

interface ButtonProps extends Omit<HTMLAttributes<HTMLElement>, 'onInput' | 'onChange'> {
  readonly variant?: SpectrumButtonVariant;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}

interface TextFieldProps extends Omit<HTMLAttributes<HTMLElement>, 'defaultValue' | 'onInput' | 'onChange'> {
  readonly value: string;
  readonly onValue: (value: string) => void;
  readonly type?: SpectrumTextFieldType;
  readonly placeholder?: string;
  readonly disabled?: boolean;
}

interface CheckboxProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onInput' | 'onChange'> {
  readonly checked: boolean;
  readonly onChecked: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly children?: ReactNode;
}

let registered = false;

/**
 * Shared UI 统一直接引用原生 SWC 包名；UXP build 通过 bundler alias 指向
 * `@swc-uxp-wrappers/*`，这样页面层只维护一套 `sp-*` 合同和注册流程。
 *
 * 这里显式 `define()` 而不是依赖副作用入口，便于在 React 测试、Chrome build、
 * 和 UXP reload 场景下保持同一套 registry guard。
 */
function registerSpectrumControls(): void {
  if (registered || typeof customElements === 'undefined') {
    return;
  }
  if (!customElements.get('sp-button')) {
    customElements.define('sp-button', SpectrumButton);
  }
  if (!customElements.get('sp-textfield')) {
    customElements.define('sp-textfield', SpectrumTextfield);
  }
  if (!customElements.get('sp-checkbox')) {
    customElements.define('sp-checkbox', SpectrumCheckbox);
  }
  registered = true;
}

function readTextValue(element: EventTarget | null | undefined): string {
  return typeof (element as SpectrumElement | null)?.value === 'string'
    ? ((element as SpectrumElement).value ?? '')
    : '';
}

function readCheckedValue(element: EventTarget | null | undefined): boolean {
  return Boolean((element as SpectrumElement | null)?.checked);
}

export function Button({ variant = 'secondary', children, disabled, className, ...props }: ButtonProps) {
  registerSpectrumControls();
  return (
    <sp-button {...props} class={className} variant={variant} disabled={disabled || undefined}>
      {children}
    </sp-button>
  );
}

export function TextField({
  value,
  onValue,
  type = 'text',
  placeholder,
  disabled,
  className,
  onKeyUp,
  onBlur,
  ...props
}: TextFieldProps) {
  registerSpectrumControls();
  const controlRef = useRef<SpectrumElement | null>(null);

  useEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return;
    }
    if (control.value !== value) {
      control.value = value;
    }
  }, [value]);

  useEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return;
    }
    control.type = type;
    control.placeholder = placeholder ?? '';
    control.disabled = Boolean(disabled);
  }, [disabled, placeholder, type]);

  const sync = useCallback(
    (target?: EventTarget | null) => {
      onValue(readTextValue(target ?? controlRef.current));
    },
    [onValue],
  );

  useEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return;
    }
    const syncFromEvent = (event: Event) => sync(event.currentTarget);
    control.addEventListener('change', syncFromEvent);
    control.addEventListener('input', syncFromEvent);
    control.addEventListener('blur', syncFromEvent);
    return () => {
      control.removeEventListener('change', syncFromEvent);
      control.removeEventListener('input', syncFromEvent);
      control.removeEventListener('blur', syncFromEvent);
    };
  }, [sync]);

  return (
    <sp-textfield
      {...props}
      ref={controlRef}
      class={className}
      value={value}
      type={type}
      placeholder={placeholder}
      disabled={disabled || undefined}
      onKeyUp={(event: KeyboardEvent<HTMLElement>) => {
        sync(event.currentTarget);
        onKeyUp?.(event);
      }}
      onBlur={onBlur}
    />
  );
}

export function Checkbox({ checked, onChecked, disabled, children, className, onClick, onKeyUp, ...props }: CheckboxProps) {
  registerSpectrumControls();
  const controlRef = useRef<SpectrumElement | null>(null);

  useEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return;
    }
    if (control.checked !== checked) {
      control.checked = checked;
    }
    control.disabled = Boolean(disabled);
  }, [checked, disabled]);

  const sync = useCallback(
    (target?: EventTarget | null) => {
      onChecked(readCheckedValue(target ?? controlRef.current));
    },
    [onChecked],
  );

  useEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return;
    }
    const syncFromEvent = (event: Event) => sync(event.currentTarget);
    control.addEventListener('change', syncFromEvent);
    return () => control.removeEventListener('change', syncFromEvent);
  }, [sync]);

  return (
    <sp-checkbox
      {...props}
      ref={controlRef}
      class={className}
      checked={checked || undefined}
      disabled={disabled || undefined}
      onClick={onClick}
      onKeyUp={onKeyUp}
    >
      {children}
    </sp-checkbox>
  );
}
