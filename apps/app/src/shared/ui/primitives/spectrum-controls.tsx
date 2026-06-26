import { useCallback, useEffect, useRef, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { Button as SpectrumButton } from '@spectrum-web-components/button';
import { Checkbox as SpectrumCheckbox } from '@spectrum-web-components/checkbox';
import { Textfield as SpectrumTextfield } from '@spectrum-web-components/textfield';
import { ActionButton as SpectrumActionButton } from '@spectrum-web-components/action-button';
import { FieldLabel as SpectrumFieldLabel } from '@spectrum-web-components/field-label';
import { HelpText as SpectrumHelpText } from '@spectrum-web-components/help-text';
import { Tag as SpectrumTag, Tags as SpectrumTags } from '@spectrum-web-components/tags';
import { Divider as SpectrumDivider } from '@spectrum-web-components/divider';
import { Tooltip as SpectrumTooltip } from '@spectrum-web-components/tooltip';
import { Toast as SpectrumToast } from '@spectrum-web-components/toast';

type SpectrumButtonVariant = 'accent' | 'primary' | 'secondary' | 'negative';
type SpectrumTextFieldType = 'text' | 'password' | 'url' | 'search';
type TooltipPlacement =
  | 'top'
  | 'top-start'
  | 'top-end'
  | 'right'
  | 'right-start'
  | 'right-end'
  | 'bottom'
  | 'bottom-start'
  | 'bottom-end'
  | 'left'
  | 'left-start'
  | 'left-end';

type SpectrumElement = HTMLElement & {
  disabled?: boolean;
  checked?: boolean;
  value?: string;
  type?: string;
  placeholder?: string;
  selected?: boolean;
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

interface ActionButtonProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  readonly quiet?: boolean;
  readonly emphasized?: boolean;
  readonly selected?: boolean;
  readonly toggles?: boolean;
  readonly disabled?: boolean;
  /** 提供时渲染 self-managed <sp-tooltip>，作为该按钮的 hover/focus 提示。 */
  readonly label?: string;
  readonly placement?: TooltipPlacement;
  readonly className?: string;
  readonly children?: ReactNode;
}

interface FieldLabelProps {
  readonly htmlFor: string;
  readonly children: ReactNode;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
}

interface HelpTextProps {
  readonly children: ReactNode;
  readonly variant?: 'negative';
  readonly className?: string;
}

interface TagProps {
  readonly children: ReactNode;
  readonly className?: string;
}

interface DividerProps {
  readonly className?: string;
  readonly vertical?: boolean;
}

let registered = false;

/**
 * Shared UI 统一直接引用原生 SWC 包名；UXP build 通过 bundler alias 指向
 * `@swc-uxp-wrappers/*`，这样页面层只维护一套 `sp-*` 合同和注册流程。
 *
 * 这里显式 `define()` 而不是依赖副作用入口，便于在 React 测试、Chrome build、
 * 和 UXP reload 场景下保持同一套 registry guard。`sp-theme` 的注册在
 * `spectrum-theme.ts` 中独立完成（它没有 UXP wrapper，走官方 SWC 包）。
 */
export function registerSpectrumControls(): void {
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
  if (!customElements.get('sp-action-button')) {
    customElements.define('sp-action-button', SpectrumActionButton);
  }
  if (!customElements.get('sp-field-label')) {
    customElements.define('sp-field-label', SpectrumFieldLabel);
  }
  if (!customElements.get('sp-help-text')) {
    customElements.define('sp-help-text', SpectrumHelpText);
  }
  if (!customElements.get('sp-tag')) {
    customElements.define('sp-tag', SpectrumTag);
  }
  if (!customElements.get('sp-tags')) {
    customElements.define('sp-tags', SpectrumTags);
  }
  if (!customElements.get('sp-divider')) {
    customElements.define('sp-divider', SpectrumDivider);
  }
  if (!customElements.get('sp-tooltip')) {
    customElements.define('sp-tooltip', SpectrumTooltip);
  }
  if (!customElements.get('sp-toast')) {
    customElements.define('sp-toast', SpectrumToast);
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

/**
 * 通用图标 / 行动按钮。`label` 提供时挂载 self-managed `<sp-tooltip>`，
 * 取代旧的 CSS `Tip` 组件。`selected` 由调用方受控（不使用 `toggles` 的内部翻转），
 * 以便在单选 chip / filter 场景下由 React state 决定高亮。
 */
export function ActionButton({
  quiet,
  emphasized,
  selected,
  toggles,
  disabled,
  label,
  placement = 'top',
  className,
  children,
  onClick,
  onKeyUp,
  ...props
}: ActionButtonProps) {
  registerSpectrumControls();
  return (
    <sp-action-button
      {...props}
      class={className}
      quiet={quiet || undefined}
      emphasized={emphasized || undefined}
      selected={selected || undefined}
      toggles={toggles || undefined}
      disabled={disabled || undefined}
      onClick={onClick}
      onKeyUp={onKeyUp}
    >
      {children}
      {label ? <sp-tooltip self-managed placement={placement}>{label}</sp-tooltip> : null}
    </sp-action-button>
  );
}

export function FieldLabel({ htmlFor, children, required, disabled, className }: FieldLabelProps) {
  registerSpectrumControls();
  return (
    <sp-field-label
      class={className}
      for={htmlFor}
      size="m"
      required={required || undefined}
      disabled={disabled || undefined}
    >
      {children}
    </sp-field-label>
  );
}

export function HelpText({ children, variant, className }: HelpTextProps) {
  registerSpectrumControls();
  return (
    <sp-help-text class={className} size="m" variant={variant === 'negative' ? 'negative' : undefined}>
      {children}
    </sp-help-text>
  );
}

export function Tag({ children, className }: TagProps) {
  registerSpectrumControls();
  return <sp-tag class={className}>{children}</sp-tag>;
}

export function Divider({ className, vertical }: DividerProps) {
  registerSpectrumControls();
  return <sp-divider class={className} vertical={vertical || undefined} />;
}
