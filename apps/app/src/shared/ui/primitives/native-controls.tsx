import {
  useCallback,
  useEffect,
  useId,
  useRef,
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { usePopupLayer } from '../components/popup-layer';
import type { UxpTextInputType } from '../components/uxp-form-controls';
import { registerSpectrumControls } from './spectrum-registry';

type NativeButtonVariant = 'accent' | 'primary' | 'secondary' | 'negative';
type NativeTextFieldType = UxpTextInputType;
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

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  readonly variant?: NativeButtonVariant;
  readonly children: ReactNode;
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'defaultValue' | 'onChange' | 'onInput' | 'type' | 'value'> {
  readonly 'data-testid'?: string;
  readonly value: string;
  readonly onValue: (value: string) => void;
  readonly type?: NativeTextFieldType;
  readonly nativeEditorSuspended?: boolean;
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'checked' | 'defaultChecked' | 'onChange' | 'type'> {
  readonly checked: boolean;
  readonly onChecked: (checked: boolean) => void;
  readonly children?: ReactNode;
}

interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'checked' | 'defaultChecked' | 'onChange' | 'type'> {
  readonly checked: boolean;
  readonly onChecked: (checked: boolean) => void;
  readonly children?: ReactNode;
}

interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'aria-pressed'> {
  readonly quiet?: boolean;
  readonly emphasized?: boolean;
  readonly selected?: boolean;
  readonly toggles?: boolean;
  readonly label?: string;
  readonly placement?: TooltipPlacement;
  readonly children?: ReactNode;
}

interface FieldLabelProps {
  readonly htmlFor: string;
  readonly children: ReactNode;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
}

interface HelpTextProps extends HTMLAttributes<HTMLSpanElement> {
  readonly children: ReactNode;
  readonly variant?: 'negative';
  readonly className?: string;
}

interface DividerProps {
  readonly className?: string;
  readonly vertical?: boolean;
}

function classNames(...parts: Array<string | undefined | false>): string | undefined {
  const value = parts.filter(Boolean).join(' ');
  return value || undefined;
}

function dataState(value: boolean | undefined): string | undefined {
  return value ? 'true' : undefined;
}

type SpectrumTextfieldElement = HTMLElement & {
  disabled?: boolean;
  placeholder?: string;
  type?: string;
  value?: string;
};

function spectrumButtonVariant(variant: NativeButtonVariant): NativeButtonVariant {
  return variant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', children, disabled, className, onClick, tabIndex, ...props },
  ref,
) {
  registerSpectrumControls();
  return (
    <sp-button
      {...(props as HTMLAttributes<HTMLElement>)}
      ref={ref as unknown as Ref<HTMLElement>}
      class={classNames('ui-btn', className)}
      variant={spectrumButtonVariant(variant)}
      data-disabled={dataState(disabled)}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      tabIndex={disabled ? -1 : tabIndex}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClick?.(event as unknown as ReactMouseEvent<HTMLButtonElement>);
      }}
    >
      {children}
    </sp-button>
  );
});

export function TextField({
  value,
  onValue,
  type = 'text',
  nativeEditorSuspended = false,
  style,
  className,
  placeholder,
  disabled,
  id,
  onKeyUp,
  onBlur,
  'data-testid': dataTestId,
  ...props
}: TextFieldProps) {
  registerSpectrumControls();
  const controlRef = useRef<SpectrumTextfieldElement | null>(null);
  const popupLayer = usePopupLayer();
  const fallbackEditorId = useId();
  const editorId = id ?? dataTestId ?? fallbackEditorId;
  const editorSuspended = nativeEditorSuspended || (popupLayer?.isNativeEditorSuspended(editorId) ?? false);

  const sync = useCallback(() => {
    onValue(controlRef.current?.value ?? '');
  }, [onValue]);

  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;
    popupLayer?.setNativeEditorElement(editorId, control);
    return () => popupLayer?.setNativeEditorElement(editorId, null);
  }, [editorId, popupLayer]);

  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;
    control.value = value;
    control.type = type === 'search' ? 'text' : type;
    control.placeholder = placeholder ?? '';
    control.disabled = Boolean(disabled);
  }, [disabled, placeholder, type, value]);

  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;
    const onValueEvent = () => sync();
    const onKeyUpEvent = (event: Event) => {
      sync();
      onKeyUp?.(event as unknown as ReactKeyboardEvent<HTMLInputElement>);
    };
    const onBlurEvent = (event: Event) => onBlur?.(event as unknown as React.FocusEvent<HTMLInputElement>);
    control.addEventListener('input', onValueEvent);
    control.addEventListener('change', onValueEvent);
    control.addEventListener('keyup', onKeyUpEvent);
    control.addEventListener('blur', onBlurEvent);
    return () => {
      control.removeEventListener('input', onValueEvent);
      control.removeEventListener('change', onValueEvent);
      control.removeEventListener('keyup', onKeyUpEvent);
      control.removeEventListener('blur', onBlurEvent);
    };
  }, [onBlur, onKeyUp, sync]);

  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;
    if (editorSuspended && document.activeElement === control) control.blur();
    control.style.display = editorSuspended ? 'none' : style?.display ?? '';
  }, [editorSuspended, style?.display]);

  return (
    <sp-textfield
      {...(props as HTMLAttributes<HTMLElement>)}
      ref={controlRef}
      class={classNames('ui-textfield', className)}
      data-uxp-textinput-spectrum="true"
      data-native-editor-suspended={editorSuspended ? 'true' : undefined}
      data-testid={dataTestId}
      id={id}
      value={value}
      type={type === 'search' ? 'text' : type}
      placeholder={placeholder}
      disabled={disabled || undefined}
      style={style}
    />
  );
}

export function Checkbox({ checked, onChecked, disabled, children, className, ...props }: CheckboxProps) {
  return (
    <label className={classNames('ui-checkbox', className)}>
      <input
        {...props}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChecked(event.currentTarget.checked)}
      />
      {children ? <span className="ui-checkbox-label">{children}</span> : null}
    </label>
  );
}

export function Radio({ checked, onChecked, disabled, children, className, ...props }: RadioProps) {
  return (
    <label className={classNames('ui-checkbox', 'ui-radio', className)}>
      <input
        {...props}
        type="radio"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChecked(event.currentTarget.checked)}
      />
      {children ? <span className="ui-checkbox-label">{children}</span> : null}
    </label>
  );
}

export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton(
  {
    quiet,
    emphasized,
    selected,
    toggles,
    disabled,
    label,
    placement,
    className,
    children,
    onClick,
    onKeyUp,
    ...props
  },
  ref,
) {
  registerSpectrumControls();
  return (
    <sp-action-button
      {...(props as HTMLAttributes<HTMLElement>)}
      ref={ref as unknown as Ref<HTMLElement>}
      class={classNames('ui-action-button', className)}
      quiet={quiet || undefined}
      emphasized={emphasized || undefined}
      selected={selected || undefined}
      toggles={toggles || undefined}
      data-tooltip-placement={placement}
      aria-label={props['aria-label'] ?? label}
      aria-pressed={toggles ? (selected ? 'true' : 'false') : undefined}
      title={label}
      disabled={disabled}
      onClick={onClick}
      onKeyUp={onKeyUp}
    >
      {children}
    </sp-action-button>
  );
});

export function FieldLabel({ htmlFor, children, required, disabled, className }: FieldLabelProps) {
  return (
    <label
      className={classNames('ui-field-label', className)}
      htmlFor={htmlFor}
      data-required={dataState(required)}
      data-disabled={dataState(disabled)}
    >
      <span>{children}</span>
    </label>
  );
}

export function HelpText({ children, variant, className, ...props }: HelpTextProps) {
  return (
    <span {...props} className={classNames('ui-help-text', className)} data-variant={variant}>
      {children}
    </span>
  );
}

export function Divider({ className, vertical }: DividerProps) {
  return <hr className={classNames('ui-divider', className)} data-orientation={vertical ? 'vertical' : 'horizontal'} aria-hidden="true" />;
}

export type NativeControlHostProps = HTMLAttributes<HTMLElement>;
