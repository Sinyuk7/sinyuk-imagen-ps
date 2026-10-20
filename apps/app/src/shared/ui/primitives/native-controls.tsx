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
import { registerSpectrumControls } from './spectrum-registry';

type NativeButtonVariant = 'accent' | 'primary' | 'secondary' | 'negative';
type NativeTextFieldType = 'text' | 'password' | 'url' | 'search';
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
  /** disabled 时仍进入键盘焦点顺序，以便辅助技术读取原因说明。 */
  readonly disabledFocusable?: boolean;
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
  readonly invalid?: boolean;
}

interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'checked' | 'defaultChecked' | 'onChange' | 'type'> {
  readonly checked: boolean;
  readonly onChecked: (checked: boolean) => void;
  readonly children?: ReactNode;
  readonly invalid?: boolean;
}

interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'aria-pressed'> {
  readonly quiet?: boolean;
  readonly emphasized?: boolean;
  readonly selected?: boolean;
  readonly toggles?: boolean;
  readonly label?: string;
  readonly tooltipText?: string | null;
  readonly tooltipTestId?: string;
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
  { variant = 'secondary', children, disabled, disabledFocusable = false, className, onClick, tabIndex, ...props },
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
      disabled={disabled && !disabledFocusable || undefined}
      tabIndex={disabled && !disabledFocusable ? -1 : tabIndex}
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

type SpectrumChoiceElement = HTMLElement & { checked?: boolean; disabled?: boolean; invalid?: boolean };

function SpectrumChoice({ type, checked, onChecked, disabled, invalid, children, className, ...props }: CheckboxProps & { readonly type: 'checkbox' | 'radio' }) {
  const controlRef = useRef<SpectrumChoiceElement | null>(null);
  const spectrumTag = type === 'checkbox' ? 'sp-checkbox' : 'sp-radio';
  const spectrumAvailable = typeof customElements !== 'undefined' && customElements.get(spectrumTag) !== undefined;

  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;
    let lastReported: boolean | undefined;
    const sync = () => {
      const next = Boolean(control.checked);
      if (lastReported === next) return;
      lastReported = next;
      onChecked(next);
    };
    control.addEventListener('input', sync);
    control.addEventListener('change', sync);
    return () => {
      control.removeEventListener('input', sync);
      control.removeEventListener('change', sync);
    };
  }, [onChecked]);

  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;
    control.checked = checked;
    control.disabled = Boolean(disabled);
    control.invalid = Boolean(invalid);
  }, [checked, disabled, invalid]);

  const onFallbackKeyDown = (event: ReactKeyboardEvent<HTMLSpanElement>) => {
    if (disabled || (event.key !== ' ' && event.key !== 'Enter')) return;
    event.preventDefault();
    onChecked(!checked);
  };

  return (
    <label className={classNames('ui-checkbox', className)} data-disabled={dataState(disabled)} data-invalid={dataState(invalid)}>
      {spectrumAvailable ? (type === 'checkbox' ? <sp-checkbox
        {...(props as HTMLAttributes<HTMLElement>)}
        ref={controlRef}
        checked={checked ? true : undefined}
        disabled={disabled ? true : undefined}
        invalid={invalid ? true : undefined}
        data-spectrum-choice="checkbox"
      /> : <sp-radio
        {...(props as HTMLAttributes<HTMLElement>)}
        ref={controlRef}
        checked={checked ? true : undefined}
        disabled={disabled ? true : undefined}
        invalid={invalid ? true : undefined}
        data-spectrum-choice="radio"
      />) : <span
        {...(props as HTMLAttributes<HTMLSpanElement>)}
        role={type}
        aria-checked={checked}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        className="ui-choice-fallback"
        data-spectrum-choice-fallback={type}
        data-invalid={dataState(invalid)}
        onClick={() => { if (!disabled) onChecked(!checked); }}
        onKeyDown={onFallbackKeyDown}
      />}
      {children ? <span className="ui-checkbox-label">{children}</span> : null}
    </label>
  );
}

export function Checkbox(props: CheckboxProps) {
  return <SpectrumChoice {...props} type="checkbox" />;
}

export function Radio(props: RadioProps) {
  return <SpectrumChoice {...props} type="radio" className={classNames('ui-radio', props.className)} />;
}

export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton(
  {
    quiet,
    emphasized,
    selected,
    toggles,
    disabled,
    label,
    tooltipText,
    tooltipTestId,
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
  const tooltipId = useId();
  const describedBy = [props['aria-describedby'], tooltipText ? tooltipId : undefined].filter(Boolean).join(' ') || undefined;
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
      aria-describedby={describedBy}
      aria-pressed={toggles ? (selected ? 'true' : 'false') : undefined}
      title={tooltipText !== undefined ? '' : label}
      data-has-tooltip={tooltipText ? 'true' : undefined}
      disabled={disabled}
      onClick={onClick}
      onKeyUp={onKeyUp}
    >
      {children}
      {tooltipText ? <sp-tooltip id={tooltipId} data-testid={tooltipTestId} open placement={placement ?? 'top'} variant="info">{tooltipText.split('\n').map((line, index) => <span key={`${index}:${line}`} className="ui-tooltip-line">{line}</span>)}</sp-tooltip> : null}
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
