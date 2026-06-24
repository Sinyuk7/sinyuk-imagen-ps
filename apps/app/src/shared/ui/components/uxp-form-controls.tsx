import {
  useCallback,
  useEffect,
  useRef,
  type ClipboardEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type RefObject,
  type TextareaHTMLAttributes,
} from 'react';

type TextInputType = 'text' | 'password' | 'url' | 'search';

type UxpTextFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'checked' | 'defaultChecked' | 'defaultValue' | 'onChange' | 'onInput' | 'type' | 'value'
> & {
  readonly value: string;
  readonly onValue: (value: string) => void;
  readonly type?: TextInputType;
};

type UxpTextAreaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'defaultValue' | 'onChange' | 'onInput' | 'value'
> & {
  readonly controlRef?: RefObject<HTMLTextAreaElement | null>;
  readonly value: string;
  readonly onValue: (value: string) => void;
};

type UxpCheckboxProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'checked' | 'defaultChecked' | 'onChange' | 'onInput' | 'type' | 'value'
> & {
  readonly checked: boolean;
  readonly onChecked: (checked: boolean) => void;
};

function scheduleSync(sync: () => void): void {
  window.setTimeout(sync, 0);
}

/** UXP-safe text field: 页面层不直接依赖 native input/change 事件。 */
export function UxpTextField({ value, onValue, type = 'text', ...props }: UxpTextFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value;
    }
  }, [value]);

  const sync = useCallback(
    (target?: HTMLInputElement | null) => {
      onValue((target ?? inputRef.current)?.value ?? '');
    },
    [onValue],
  );

  const syncFromKeyboard = (event: KeyboardEvent<HTMLInputElement>) => sync(event.currentTarget);
  const syncFromFocus = (event: FocusEvent<HTMLInputElement>) => sync(event.currentTarget);
  const syncAfterClipboard = (event: ClipboardEvent<HTMLInputElement>) => {
    const target = event.currentTarget;
    scheduleSync(() => sync(target));
  };

  return (
    <input
      {...props}
      ref={inputRef}
      type={type}
      defaultValue={value}
      onBlur={syncFromFocus}
      onKeyUp={syncFromKeyboard}
      onPaste={syncAfterClipboard}
      onCut={syncAfterClipboard}
    />
  );
}

/** UXP-safe textarea: 保留 keydown 命令入口，但文本同步集中在安全控件内。 */
export function UxpTextArea({ controlRef, value, onValue, onKeyDown, ...props }: UxpTextAreaProps) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const bindRef = (element: HTMLTextAreaElement | null): void => {
    textAreaRef.current = element;
    if (controlRef) {
      (controlRef as { current: HTMLTextAreaElement | null }).current = element;
    }
  };

  useEffect(() => {
    if (textAreaRef.current && textAreaRef.current.value !== value) {
      textAreaRef.current.value = value;
    }
  }, [value]);

  const sync = useCallback(
    (target?: HTMLTextAreaElement | null) => {
      onValue((target ?? textAreaRef.current)?.value ?? '');
    },
    [onValue],
  );

  const syncFromKeyboard = (event: KeyboardEvent<HTMLTextAreaElement>) => sync(event.currentTarget);
  const syncFromFocus = (event: FocusEvent<HTMLTextAreaElement>) => sync(event.currentTarget);
  const syncAfterClipboard = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const target = event.currentTarget;
    scheduleSync(() => sync(target));
  };

  return (
    <textarea
      {...props}
      ref={bindRef}
      defaultValue={value}
      onBlur={syncFromFocus}
      onKeyDown={(event) => {
        sync(event.currentTarget);
        onKeyDown?.(event);
      }}
      onKeyUp={syncFromKeyboard}
      onPaste={syncAfterClipboard}
      onCut={syncAfterClipboard}
    />
  );
}

/** UXP-safe checkbox: 使用 uncontrolled host value，并在用户路径上同步 React 状态。 */
export function UxpCheckbox({ checked, onChecked, ...props }: UxpCheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current && inputRef.current.checked !== checked) {
      inputRef.current.checked = checked;
    }
  }, [checked]);

  const sync = useCallback(
    (target?: HTMLInputElement | null) => {
      onChecked((target ?? inputRef.current)?.checked ?? false);
    },
    [onChecked],
  );

  const syncFromKeyboard = (event: KeyboardEvent<HTMLInputElement>) => sync(event.currentTarget);
  const syncFromFocus = (event: FocusEvent<HTMLInputElement>) => sync(event.currentTarget);

  return (
    <input
      {...props}
      ref={inputRef}
      type="checkbox"
      defaultChecked={checked}
      onBlur={syncFromFocus}
      onClick={(event) => sync(event.currentTarget)}
      onKeyUp={syncFromKeyboard}
    />
  );
}
