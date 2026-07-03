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

type ClipboardReader = {
  readonly read?: () => Promise<unknown>;
  readonly readText?: () => Promise<unknown>;
  readonly getContent?: () => Promise<unknown>;
};

const PASTE_FALLBACK_DELAYS_MS = [0, 50, 150, 300] as const;

function scheduleSync(sync: () => void): void {
  window.setTimeout(sync, 0);
}

function isPasteShortcut(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'v';
}

function normalizeClipboardText(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const text = (value as Record<string, unknown>)['text/plain'];
  return typeof text === 'string' ? text : null;
}

async function readClipboardText(): Promise<string | null> {
  const clipboard = navigator.clipboard as unknown as ClipboardReader | undefined;
  if (!clipboard) {
    return null;
  }
  if (typeof clipboard.readText === 'function') {
    const text = normalizeClipboardText(await clipboard.readText());
    if (text !== null) {
      return text;
    }
  }
  if (typeof clipboard.read === 'function') {
    const text = normalizeClipboardText(await clipboard.read());
    if (text !== null) {
      return text;
    }
  }
  if (typeof clipboard.getContent === 'function') {
    const text = normalizeClipboardText(await clipboard.getContent());
    if (text !== null) {
      return text;
    }
  }
  return null;
}

function insertTextAtSelection(target: HTMLTextAreaElement, text: string, start: number, end: number): void {
  const value = target.value;
  target.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
  const caret = start + text.length;
  target.selectionStart = caret;
  target.selectionEnd = caret;
}

/**
 * 当前 shared UI 仍保留原生 textarea。
 *
 * SWC 0.37.0 / 当前 UXP wrapper 组合里没有与 Chrome/UXP 都稳定覆盖的 textarea
 * 契约，因此多行 prompt 输入继续走这一份 UXP-safe 实现。
 */
export function UxpTextArea({ controlRef, value, onValue, onKeyDown, ...props }: UxpTextAreaProps) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const pasteFallbackRequestRef = useRef(0);

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
  const fallbackPaste = (target: HTMLTextAreaElement, readText: () => Promise<string | null>) => {
    const requestId = pasteFallbackRequestRef.current + 1;
    pasteFallbackRequestRef.current = requestId;
    const previousValue = target.value;
    const selectionStart = target.selectionStart;
    const selectionEnd = target.selectionEnd;
    PASTE_FALLBACK_DELAYS_MS.forEach((delayMs, index) => {
      window.setTimeout(() => {
        if (pasteFallbackRequestRef.current !== requestId) {
          return;
        }
        if (target.value !== previousValue) {
          pasteFallbackRequestRef.current = requestId + 1;
          sync(target);
          return;
        }
        if (index < PASTE_FALLBACK_DELAYS_MS.length - 1) {
          return;
        }
        void readText().then((text) => {
          if (pasteFallbackRequestRef.current !== requestId || target.value !== previousValue || !text) {
            return;
          }
          pasteFallbackRequestRef.current = requestId + 1;
          insertTextAtSelection(target, text, selectionStart, selectionEnd);
          sync(target);
        }).catch(() => undefined);
      }, delayMs);
    });
  };
  const fallbackPasteFromKeyboard = (target: HTMLTextAreaElement) => fallbackPaste(target, readClipboardText);
  const fallbackPasteFromClipboardEvent = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const target = event.currentTarget;
    const text = event.clipboardData?.getData('text/plain') ?? null;
    if (!target.readOnly && !target.disabled && text) {
      fallbackPaste(target, () => Promise.resolve(text));
    }
    scheduleSync(() => sync(target));
  };

  return (
    <textarea
      {...props}
      ref={bindRef}
      defaultValue={value}
      onBlur={syncFromFocus}
      onKeyDown={(event) => {
        if (!event.currentTarget.readOnly && !event.currentTarget.disabled && isPasteShortcut(event)) {
          fallbackPasteFromKeyboard(event.currentTarget);
        }
        sync(event.currentTarget);
        onKeyDown?.(event);
      }}
      onKeyUp={syncFromKeyboard}
      onPaste={fallbackPasteFromClipboardEvent}
      onCut={syncAfterClipboard}
    />
  );
}
