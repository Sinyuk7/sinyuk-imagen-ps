import {
  useCallback,
  useEffect,
  useId,
  useState,
  useRef,
  type ClipboardEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type TextareaHTMLAttributes,
} from 'react';
import { usePopupLayer } from './popup-layer';

export type UxpTextInputType = 'text' | 'password' | 'url' | 'search';

type UxpTextInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'defaultValue' | 'onChange' | 'onInput' | 'type' | 'value'
> & {
  readonly controlRef?: RefObject<HTMLInputElement | null>;
  readonly value: string;
  readonly onValue: (value: string) => void;
  readonly type?: UxpTextInputType;
  /**
   * Photoshop UXP 下，原生 input 与 portaled popup 重叠时也可能继续抢占命中。
   * 单行输入与 textarea 同属 shared text-input seam，统一通过 popup-layer 挂起。
   */
  readonly nativeEditorSuspended?: boolean;
  readonly 'data-testid'?: string;
};

type UxpTextAreaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'defaultValue' | 'onChange' | 'onInput' | 'value'
> & {
  readonly controlRef?: RefObject<HTMLTextAreaElement | null>;
  readonly value: string;
  readonly onValue: (value: string) => void;
  /**
   * Photoshop UXP 下，原生 textarea 与 portaled popup 重叠时可能继续抢占命中。
   * 打开相关浮层时挂起 native text editor layer，关闭后再恢复显示。
   */
  readonly nativeEditorSuspended?: boolean;
  readonly 'data-testid'?: string;
};

type UxpTextAreaFieldProps = UxpTextAreaProps & {
  readonly shellClassName?: string;
  readonly shellVariant?: 'settings';
  readonly hint?: ReactNode;
  readonly invalid?: boolean;
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
 * 当前 shared UI 的 text input seam 仍保留原生 input。
 *
 * Photoshop UXP 的 native editor layer 会与 portaled popup 发生 hit-test 冲突，
 * 因此单行输入与多行输入都必须注册到 popup-layer，由 overlap contract 统一挂起。
 */
export function UxpTextInput({
  controlRef,
  value,
  onValue,
  type = 'text',
  nativeEditorSuspended = false,
  style,
  className,
  placeholder,
  disabled,
  id,
  title,
  onKeyUp,
  onBlur,
  'data-testid': dataTestId,
  ...props
}: UxpTextInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const popupLayer = usePopupLayer();
  const fallbackEditorId = useId();
  const editorId = id ?? dataTestId ?? fallbackEditorId;
  const editorSuspended = nativeEditorSuspended || (popupLayer?.isNativeEditorSuspended(editorId) ?? false);

  const bindRef = (element: HTMLInputElement | null): void => {
    inputRef.current = element;
    if (controlRef) {
      (controlRef as { current: HTMLInputElement | null }).current = element;
    }
  };

  useEffect(() => {
    popupLayer?.setNativeEditorElement(editorId, inputRef.current);
    return () => {
      popupLayer?.setNativeEditorElement(editorId, null);
    };
  }, [editorId, popupLayer]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input || !editorSuspended) {
      return;
    }
    if (document.activeElement === input) {
      input.blur();
    }
  }, [editorSuspended]);

  const sync = useCallback(
    (target?: HTMLInputElement | null) => {
      onValue((target ?? inputRef.current)?.value ?? '');
    },
    [onValue],
  );

  return (
    <input
      {...props}
      ref={bindRef}
      id={id}
      title={title}
      className={className}
      data-testid={dataTestId}
      value={value}
      type={type}
      placeholder={placeholder}
      disabled={disabled}
      data-uxp-textinput-native="true"
      data-native-editor-suspended={editorSuspended ? 'true' : undefined}
      style={{
        ...style,
        ...(editorSuspended
          ? {
              display: 'none',
              pointerEvents: 'none',
            }
          : null),
      }}
      onInput={(event) => sync(event.currentTarget)}
      onChange={(event) => sync(event.currentTarget)}
      onKeyUp={(event) => {
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

/**
 * 当前 shared UI 的 text input seam 仍保留原生 textarea。
 *
 * SWC 0.37.0 / 当前 UXP wrapper 组合里没有与 Chrome/UXP 都稳定覆盖的统一 rich
 * text editor 契约，因此多行输入继续走这一份 popup-aware native editor seam。
 */
export function UxpTextArea({
  controlRef,
  value,
  onValue,
  onKeyDown,
  nativeEditorSuspended = false,
  style,
  className,
  placeholder,
  rows,
  id,
  title,
  'data-testid': dataTestId,
  ...props
}: UxpTextAreaProps) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const pasteFallbackRequestRef = useRef(0);
  const popupLayer = usePopupLayer();
  const fallbackEditorId = useId();
  const editorId = id ?? dataTestId ?? fallbackEditorId;
  const editorSuspended = nativeEditorSuspended || (popupLayer?.isNativeEditorSuspended(editorId) ?? false);

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

  useEffect(() => {
    popupLayer?.setNativeEditorElement(editorId, textAreaRef.current);
    return () => {
      popupLayer?.setNativeEditorElement(editorId, null);
    };
  }, [editorId, popupLayer]);

  useEffect(() => {
    const textarea = textAreaRef.current;
    if (!textarea || !editorSuspended) {
      return;
    }
    if (document.activeElement === textarea) {
      textarea.blur();
    }
  }, [editorSuspended]);

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

  const nativeTextArea = (
    <textarea
      {...props}
      ref={bindRef}
      id={id}
      title={title}
      className={className}
      data-testid={dataTestId}
      rows={rows}
      placeholder={placeholder}
      defaultValue={value}
      data-uxp-textarea-native="true"
      data-native-editor-suspended={editorSuspended ? 'true' : undefined}
      style={{
        ...style,
        ...(editorSuspended
          ? {
              display: 'none',
              pointerEvents: 'none',
            }
          : null),
      }}
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

  return (
    nativeTextArea
  );
}

/**
 * 为 settings 类多行输入提供稳定视觉外壳；native editor layer 只负责输入。
 */
export function UxpTextAreaField({
  shellClassName,
  shellVariant = 'settings',
  className,
  disabled,
  nativeEditorSuspended = false,
  hint,
  invalid = false,
  onFocus,
  onBlur,
  ...props
}: UxpTextAreaFieldProps) {
  const [focused, setFocused] = useState(false);
  const popupLayer = usePopupLayer();
  const fallbackEditorId = useId();
  const editorId = props.id ?? props['data-testid'] ?? fallbackEditorId;
  const editorSuspended = nativeEditorSuspended || (popupLayer?.isNativeEditorSuspended(editorId) ?? false);
  const shellClasses = [
    shellVariant === 'settings' ? 'field-textarea-shell' : '',
    shellClassName ?? '',
  ].filter(Boolean).join(' ');
  const nativeClassName = [
    shellVariant === 'settings' ? 'field-textarea-native' : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <div
        className={shellClasses}
        data-focused={focused ? 'true' : undefined}
        data-disabled={disabled ? 'true' : undefined}
        data-invalid={invalid ? 'true' : undefined}
        data-native-editor-suspended={editorSuspended ? 'true' : undefined}
      >
        <UxpTextArea
          {...props}
          className={nativeClassName}
          disabled={disabled}
          nativeEditorSuspended={editorSuspended}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
        />
      </div>
      {hint}
    </>
  );
}
