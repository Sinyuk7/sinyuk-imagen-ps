import {
  useCallback,
  useEffect,
  useId,
  useState,
  useRef,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type TextareaHTMLAttributes,
} from 'react';
import { useOptionalAppServices } from '../../ports/app-services-context';
import { getGlobalDiagnosticsPort } from '../../ports/diagnostics-port';
import { usePopupLayer } from './popup-layer';

/** Spectrum UXP textarea 暴露的编辑器能力；不依赖 HTML textarea 的宿主绘制。 */
export type UxpTextAreaElement = HTMLElement & Pick<
  HTMLTextAreaElement,
  'value' | 'selectionStart' | 'selectionEnd' | 'readOnly' | 'disabled' | 'focus' | 'blur'
>;

type UxpTextAreaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'defaultValue' | 'onChange' | 'onInput' | 'value'
> & {
  readonly controlRef?: RefObject<UxpTextAreaElement | null>;
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
const DELETE_SYNC_CHECK_DELAY_MS = 120;

type TextAreaSyncCause = 'input' | 'change' | 'keyup' | 'blur' | 'paste-fallback' | 'cut';

type TextAreaDeleteProbe = {
  readonly requestId: number;
  readonly key: 'Backspace' | 'Delete';
  readonly valueBefore: string;
  readonly propBefore: string;
  readonly selectionStart: number | null;
  readonly selectionEnd: number | null;
  sawInput: boolean;
  sawChange: boolean;
  sawKeyUp: boolean;
  sawBlur: boolean;
  sawPasteFallback: boolean;
  sawCut: boolean;
  readonly startedAtMs: number;
};

function scheduleSync(sync: () => void): void {
  window.setTimeout(sync, 0);
}

function isPasteShortcut(event: KeyboardEvent<UxpTextAreaElement>): boolean {
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

function insertTextAtSelection(target: UxpTextAreaElement, text: string, start: number, end: number): void {
  const value = target.value;
  target.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
  const caret = start + text.length;
  target.selectionStart = caret;
  target.selectionEnd = caret;
}

function deleteTextAtSelection(target: UxpTextAreaElement, key: 'Backspace' | 'Delete'): boolean {
  const start = selectionIndex(target.selectionStart);
  const end = selectionIndex(target.selectionEnd);
  if (start === null || end === null) {
    return false;
  }
  if (end > start) {
    target.value = `${target.value.slice(0, start)}${target.value.slice(end)}`;
    target.selectionStart = start;
    target.selectionEnd = start;
    return true;
  }
  if (key === 'Backspace') {
    if (start <= 0) {
      return false;
    }
    const caret = start - 1;
    target.value = `${target.value.slice(0, caret)}${target.value.slice(end)}`;
    target.selectionStart = caret;
    target.selectionEnd = caret;
    return true;
  }
  if (end >= target.value.length) {
    return false;
  }
  target.value = `${target.value.slice(0, start)}${target.value.slice(end + 1)}`;
  target.selectionStart = start;
  target.selectionEnd = start;
  return true;
}

function selectionIndex(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function canDeleteFromSelection(target: UxpTextAreaElement, key: 'Backspace' | 'Delete'): boolean {
  const start = selectionIndex(target.selectionStart);
  const end = selectionIndex(target.selectionEnd);
  if (start === null || end === null) {
    return false;
  }
  if (end > start) {
    return true;
  }
  return key === 'Backspace' ? start > 0 : end < target.value.length;
}

/**
 * 多行输入使用 Photoshop 内置 `sp-textarea`，事件与编辑 fallback 仍集中在此 seam。
 */
export function UxpTextArea({
  controlRef,
  value,
  onValue,
  onKeyDown,
  onFocus,
  onBlur,
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
  const textAreaRef = useRef<UxpTextAreaElement>(null);
  const pasteFallbackRequestRef = useRef(0);
  const propValueRef = useRef(value);
  const deleteProbeRef = useRef<TextAreaDeleteProbe | null>(null);
  const deleteProbeRequestRef = useRef(0);
  const loggedDiagnosticKeysRef = useRef<Set<string>>(new Set());
  const services = useOptionalAppServices();
  const diagnostics = services?.diagnostics ?? getGlobalDiagnosticsPort();
  const popupLayer = usePopupLayer();
  const fallbackEditorId = useId();
  const editorId = id ?? dataTestId ?? fallbackEditorId;
  const editorSuspended = nativeEditorSuspended || (popupLayer?.isNativeEditorSuspended(editorId) ?? false);

  const logDiagnosticOnce = useCallback((event: string, attrs: Record<string, unknown>) => {
    const diagnosticKey = `${editorId}:${event}`;
    if (loggedDiagnosticKeysRef.current.has(diagnosticKey)) {
      return;
    }
    loggedDiagnosticKeysRef.current.add(diagnosticKey);
    void diagnostics?.checkpoint(event, {
      editorId,
      ...attrs,
    });
  }, [diagnostics, editorId]);

  const bindRef = (element: UxpTextAreaElement | null): void => {
    textAreaRef.current = element;
    if (controlRef) {
      (controlRef as { current: UxpTextAreaElement | null }).current = element;
    }
  };

  useEffect(() => {
    const textarea = textAreaRef.current;
    propValueRef.current = value;
    if (textarea && textarea.value !== value) {
      textarea.value = value;
    }
  }, [logDiagnosticOnce, value]);

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
    (target?: UxpTextAreaElement | null, cause?: TextAreaSyncCause) => {
      const textarea = target ?? textAreaRef.current;
      const probe = deleteProbeRef.current;
      if (textarea && probe) {
        if (cause === 'input') {
          probe.sawInput = true;
        } else if (cause === 'change') {
          probe.sawChange = true;
        } else if (cause === 'keyup') {
          probe.sawKeyUp = true;
        } else if (cause === 'blur') {
          probe.sawBlur = true;
        } else if (cause === 'paste-fallback') {
          probe.sawPasteFallback = true;
        } else if (cause === 'cut') {
          probe.sawCut = true;
        }
      }
      onValue((target ?? textAreaRef.current)?.value ?? '');
    },
    [onValue],
  );

  const scheduleDeleteSyncProbe = useCallback((target: UxpTextAreaElement, key: 'Backspace' | 'Delete') => {
    if (!canDeleteFromSelection(target, key)) {
      return;
    }
    const requestId = deleteProbeRequestRef.current + 1;
    deleteProbeRequestRef.current = requestId;
    deleteProbeRef.current = {
      requestId,
      key,
      valueBefore: target.value,
      propBefore: propValueRef.current,
      selectionStart: selectionIndex(target.selectionStart),
      selectionEnd: selectionIndex(target.selectionEnd),
      sawInput: false,
      sawChange: false,
      sawKeyUp: false,
      sawBlur: false,
      sawPasteFallback: false,
      sawCut: false,
      startedAtMs: Date.now(),
    };

    window.setTimeout(() => {
      const probe = deleteProbeRef.current;
      if (!probe || probe.requestId !== requestId || textAreaRef.current !== target) {
        return;
      }
      deleteProbeRef.current = null;
      const domValue = target.value;
      const propValue = propValueRef.current;
      const domChanged = domValue !== probe.valueBefore;
      const propChanged = propValue !== probe.propBefore;
      const attrs = {
        key: probe.key,
        beforeLength: probe.valueBefore.length,
        selectionStartBefore: probe.selectionStart,
        selectionEndBefore: probe.selectionEnd,
        sawInput: probe.sawInput,
        sawChange: probe.sawChange,
        sawKeyUp: probe.sawKeyUp,
        sawBlur: probe.sawBlur,
        sawPasteFallback: probe.sawPasteFallback,
        sawCut: probe.sawCut,
        delayMs: Date.now() - probe.startedAtMs,
      };
      if (!domChanged) {
        if (document.activeElement === target && !target.readOnly && !target.disabled && deleteTextAtSelection(target, probe.key)) {
          sync(target);
          logDiagnosticOnce('uxp.ui.textarea.delete.native_fallback_applied', {
            ...attrs,
            appliedLength: target.value.length,
            appliedSelectionStart: selectionIndex(target.selectionStart),
            appliedSelectionEnd: selectionIndex(target.selectionEnd),
          });
        } else {
          logDiagnosticOnce('uxp.ui.textarea.delete.no_native_change', {
            ...attrs,
            domLength: domValue.length,
            propLength: propValue.length,
            selectionStart: selectionIndex(target.selectionStart),
            selectionEnd: selectionIndex(target.selectionEnd),
          });
        }
        return;
      }
      if (!propChanged || propValue !== domValue) {
        logDiagnosticOnce('uxp.ui.textarea.delete.unsynced', attrs);
      }
    }, DELETE_SYNC_CHECK_DELAY_MS);
  }, [logDiagnosticOnce]);

  const syncFromKeyboard = (event: KeyboardEvent<UxpTextAreaElement>) => sync(event.currentTarget, 'keyup');
  const syncFromFocus = (event: FocusEvent<UxpTextAreaElement>) => {
    sync(event.currentTarget, 'blur');
    onBlur?.(event as unknown as FocusEvent<HTMLTextAreaElement>);
  };
  const syncAfterClipboard = (event: ClipboardEvent<UxpTextAreaElement>) => {
    const target = event.currentTarget;
    scheduleSync(() => sync(target, 'cut'));
  };
  const fallbackPaste = (target: UxpTextAreaElement, readText: () => Promise<string | null>) => {
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
          sync(target, 'paste-fallback');
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
          sync(target, 'paste-fallback');
        }).catch(() => undefined);
      }, delayMs);
    });
  };
  const fallbackPasteFromKeyboard = (target: UxpTextAreaElement) => fallbackPaste(target, readClipboardText);
  const fallbackPasteFromClipboardEvent = (event: ClipboardEvent<UxpTextAreaElement>) => {
    const target = event.currentTarget;
    const text = event.clipboardData?.getData('text/plain') ?? null;
    if (!target.readOnly && !target.disabled && text) {
      fallbackPaste(target, () => Promise.resolve(text));
    }
    scheduleSync(() => sync(target, 'paste-fallback'));
  };

  return (
    <sp-textarea
      {...(props as React.HTMLAttributes<HTMLElement>)}
      ref={bindRef}
      id={id}
      title={title}
      class={className}
      data-testid={dataTestId}
      rows={rows}
      placeholder={placeholder}
      value={value}
      data-uxp-textarea-spectrum="true"
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
      onFocus={(event) => onFocus?.(event as unknown as FocusEvent<HTMLTextAreaElement>)}
      onInput={(event) => sync(event.currentTarget as UxpTextAreaElement, 'input')}
      onChange={(event) => sync(event.currentTarget as UxpTextAreaElement, 'change')}
      onBlur={(event) => syncFromFocus(event as unknown as FocusEvent<UxpTextAreaElement>)}
      onKeyDown={(event) => {
        const target = event.currentTarget as UxpTextAreaElement;
        if (!target.readOnly && !target.hasAttribute('disabled') && isPasteShortcut(event as unknown as KeyboardEvent<UxpTextAreaElement>)) {
          fallbackPasteFromKeyboard(target);
        }
        if (event.key === 'Backspace' || event.key === 'Delete') {
          scheduleDeleteSyncProbe(target, event.key);
        }
        onKeyDown?.(event as unknown as KeyboardEvent<HTMLTextAreaElement>);
      }}
      onKeyUp={(event) => syncFromKeyboard(event as unknown as KeyboardEvent<UxpTextAreaElement>)}
      onPaste={(event) => fallbackPasteFromClipboardEvent(event as unknown as ClipboardEvent<UxpTextAreaElement>)}
      onCut={(event) => syncAfterClipboard(event as unknown as ClipboardEvent<UxpTextAreaElement>)}
    />
  );
}

/**
 * 为 settings 类多行输入提供布局外壳；Spectrum widget 负责控件视觉。
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
