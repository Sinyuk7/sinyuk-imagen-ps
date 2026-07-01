import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

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
  readonly children: ReactNode;
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'defaultValue' | 'onChange' | 'type' | 'value'> {
  readonly value: string;
  readonly onValue: (value: string) => void;
  readonly type?: NativeTextFieldType;
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'checked' | 'defaultChecked' | 'onChange' | 'type'> {
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

interface HelpTextProps {
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

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', children, disabled, className, ...props },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type="button"
      className={classNames('ui-btn', className)}
      data-variant={variant}
      disabled={disabled}
    >
      {children}
    </button>
  );
});

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
  const sync = (next: string) => onValue(next);

  return (
    <input
      {...props}
      className={classNames('ui-textfield', className)}
      value={value}
      type={type}
      placeholder={placeholder}
      disabled={disabled}
      onInput={(event) => sync(event.currentTarget.value)}
      onChange={(event) => sync(event.currentTarget.value)}
      onKeyUp={(event: KeyboardEvent<HTMLInputElement>) => {
        sync(event.currentTarget.value);
        onKeyUp?.(event);
      }}
      onBlur={(event) => {
        sync(event.currentTarget.value);
        onBlur?.(event);
      }}
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
  return (
    <button
      {...props}
      ref={ref}
      type="button"
      className={classNames('ui-action-button', className)}
      data-quiet={dataState(quiet)}
      data-emphasized={dataState(emphasized)}
      data-selected={dataState(selected)}
      data-toggles={dataState(toggles)}
      data-tooltip-placement={placement}
      aria-label={props['aria-label'] ?? label}
      aria-pressed={toggles ? Boolean(selected) : undefined}
      title={label}
      disabled={disabled}
      onClick={onClick}
      onKeyUp={onKeyUp}
    >
      {children}
    </button>
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

export function HelpText({ children, variant, className }: HelpTextProps) {
  return (
    <span className={classNames('ui-help-text', className)} data-variant={variant}>
      {children}
    </span>
  );
}

export function Divider({ className, vertical }: DividerProps) {
  return <hr className={classNames('ui-divider', className)} data-orientation={vertical ? 'vertical' : 'horizontal'} aria-hidden="true" />;
}

export type NativeControlHostProps = HTMLAttributes<HTMLElement>;
