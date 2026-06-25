import {
  useCallback,
  useEffect,
  useRef,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
  type TextareaHTMLAttributes,
} from 'react';

type UxpTextAreaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'defaultValue' | 'onChange' | 'onInput' | 'value'
> & {
  readonly controlRef?: RefObject<HTMLTextAreaElement | null>;
  readonly value: string;
  readonly onValue: (value: string) => void;
};

function scheduleSync(sync: () => void): void {
  window.setTimeout(sync, 0);
}

/**
 * 当前 shared UI 仍保留原生 textarea。
 *
 * SWC 0.37.0 / 当前 UXP wrapper 组合里没有与 Chrome/UXP 都稳定覆盖的 textarea
 * 契约，因此多行 prompt 输入继续走这一份 UXP-safe 实现。
 */
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
