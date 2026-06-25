import { useCallback, useEffect, useRef, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { Button as SpectrumButton } from '@swc-uxp-wrappers/button';
import { Checkbox as SpectrumCheckbox } from '@swc-uxp-wrappers/checkbox';
import { Textfield as SpectrumTextfield } from '@swc-uxp-wrappers/textfield';

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

interface TextFieldProps extends Omit<React.HTMLAttributes<HTMLElement>, 'defaultValue' | 'onInput' | 'onChange'> {
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
 * 注册 SWC 自定义元素，并避免 UXP reload 或测试重复 import 时重复 define。
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
    control.addEventListener('keyup', syncFromEvent);
    control.addEventListener('blur', syncFromEvent);
    return () => {
      control.removeEventListener('change', syncFromEvent);
      control.removeEventListener('input', syncFromEvent);
      control.removeEventListener('keyup', syncFromEvent);
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
      onBlur={(event) => {
        sync(event.currentTarget);
        onBlur?.(event);
      }}
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
      onClick={(event) => {
        window.setTimeout(() => sync(event.currentTarget), 0);
        onClick?.(event);
      }}
      onKeyUp={(event) => {
        sync(event.currentTarget);
        onKeyUp?.(event);
      }}
    >
      {children}
    </sp-checkbox>
  );
}
