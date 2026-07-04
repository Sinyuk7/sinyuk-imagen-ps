import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './icons';
import { IconButton } from '../primitives/icon-button';
import { ActionButton } from '../primitives/native-controls';

export type NoticeTone = 'positive' | 'negative' | 'warning' | 'info' | 'neutral';
export type NoticeRole = 'status' | 'alert';
export type NoticeAriaLive = 'polite' | 'assertive';

export interface NoticeAction {
  readonly label: string;
  readonly ariaLabel?: string;
  readonly onAction: () => void | Promise<void>;
}

export interface NoticeOptions {
  readonly dismissible?: boolean;
  readonly copyable?: boolean;
  readonly detailCopyable?: boolean;
  readonly durationMs?: number | null;
  readonly role?: NoticeRole;
  readonly ariaLive?: NoticeAriaLive;
  readonly icon?: IconName | null;
  readonly detail?: string | null;
  readonly action?: NoticeAction | null;
  readonly key?: string;
  readonly priority?: number;
  readonly urgent?: boolean;
}

export interface NoticeState extends NoticeOptions {
  readonly message: string;
  readonly tone: NoticeTone;
}

export interface NoticeController {
  readonly notice: NoticeState | null;
  readonly show: (message: string, tone?: NoticeTone, options?: NoticeOptions) => void;
  readonly clear: () => void;
  readonly pause: () => void;
  readonly resume: () => void;
}

interface UseNoticeOptions {
  readonly defaultDurationMs?: number | null;
}

interface NoticeViewProps {
  readonly notice: NoticeState;
  readonly kind: 'toast' | 'inline';
  readonly onClear?: () => void;
  readonly motionState?: string;
  readonly onPause?: () => void;
  readonly onResume?: () => void;
}

type ToastTextSize = 'md' | 'sm' | 'xs';

async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return true;
  }

  if (typeof document === 'undefined') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand('copy');
  } finally {
    textarea.remove();
  }
}

function inlineToneClass(tone: NoticeTone): string {
  if (tone === 'positive') return 'success';
  if (tone === 'negative') return 'error';
  return tone;
}

function defaultRole(tone: NoticeTone): NoticeRole {
  return tone === 'negative' ? 'alert' : 'status';
}

function defaultAriaLive(tone: NoticeTone): NoticeAriaLive {
  return tone === 'negative' ? 'assertive' : 'polite';
}

function defaultIcon(tone: NoticeTone): IconName | null {
  if (tone === 'positive') return 'check';
  if (tone === 'negative') return 'error';
  if (tone === 'warning') return 'warning';
  if (tone === 'info') return 'info';
  return null;
}

export function createNoticeState(
  message: string,
  tone: NoticeTone,
  options: NoticeOptions | undefined,
  defaultDurationMs: number | null,
): NoticeState {
  return {
    message,
    tone,
    dismissible: options?.dismissible ?? false,
    copyable: options?.copyable ?? false,
    detailCopyable: options?.detailCopyable ?? false,
    durationMs: options?.durationMs ?? defaultDurationMs,
    role: options?.role ?? defaultRole(tone),
    ariaLive: options?.ariaLive ?? defaultAriaLive(tone),
    icon: options?.icon === undefined ? defaultIcon(tone) : options.icon,
    detail: options?.detail,
    action: options?.action ?? null,
    key: options?.key,
    priority: options?.priority,
    urgent: options?.urgent ?? false,
  };
}

export function useNotice({ defaultDurationMs = null }: UseNoticeOptions = {}): NoticeController {
  /** 每个 Notice Host 各自持有本地状态；共享的是数据结构与渲染规则，不是全局单例。 */
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const timerRef = useRef<number | null>(null);
  const remainingMsRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const pausedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startedAtRef.current = null;
  }, []);

  const clear = useCallback(() => {
    clearTimer();
    remainingMsRef.current = null;
    pausedRef.current = false;
    setNotice(null);
  }, [clearTimer]);

  const armTimer = useCallback((durationMs: number | null | undefined) => {
    if (durationMs == null || durationMs <= 0) {
      remainingMsRef.current = null;
      return;
    }
    remainingMsRef.current = durationMs;
    startedAtRef.current = Date.now();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      startedAtRef.current = null;
      remainingMsRef.current = null;
      setNotice(null);
    }, durationMs);
  }, []);

  const pause = useCallback(() => {
    if (timerRef.current == null || startedAtRef.current == null || remainingMsRef.current == null) {
      return;
    }
    const elapsed = Date.now() - startedAtRef.current;
    remainingMsRef.current = Math.max(0, remainingMsRef.current - elapsed);
    pausedRef.current = true;
    clearTimer();
  }, [clearTimer]);

  const resume = useCallback(() => {
    if (!pausedRef.current) {
      return;
    }
    pausedRef.current = false;
    armTimer(remainingMsRef.current);
  }, [armTimer]);

  const show = useCallback(
    (message: string, tone: NoticeTone = 'neutral', options?: NoticeOptions) => {
      clearTimer();
      pausedRef.current = false;
      const next = createNoticeState(message, tone, options, defaultDurationMs);
      setNotice(next);
      armTimer(next.durationMs);
    },
    [armTimer, clearTimer, defaultDurationMs],
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  return { notice, show, clear, pause, resume };
}

export function NoticeView({ notice, kind, onClear, motionState, onPause, onResume }: NoticeViewProps) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const messageRef = useRef<HTMLSpanElement | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const [toastTextSize, setToastTextSize] = useState<ToastTextSize>('md');
  const [toastMessageTruncated, setToastMessageTruncated] = useState(false);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current != null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      if (resizeFrameRef.current != null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(resizeFrameRef.current);
      }
    };
  }, []);

  const measureToastText = useCallback(() => {
    if (kind !== 'toast') {
      return;
    }
    const host = ref.current;
    const message = messageRef.current;
    if (!host || !message) {
      return;
    }

    const overflowsAt = (size: ToastTextSize): boolean => {
      host.dataset.textSize = size;
      return message.scrollWidth > message.clientWidth + 1;
    };

    let nextSize: ToastTextSize = 'md';
    let truncated = false;
    if (overflowsAt('md')) {
      nextSize = 'sm';
      if (overflowsAt('sm')) {
        nextSize = 'xs';
        truncated = overflowsAt('xs');
      }
    }

    setToastTextSize((current) => (current === nextSize ? current : nextSize));
    setToastMessageTruncated((current) => (current === truncated ? current : truncated));
  }, [kind]);

  useLayoutEffect(() => {
    if (kind !== 'toast') {
      setToastTextSize('md');
      setToastMessageTruncated(false);
      return;
    }

    measureToastText();
    const host = ref.current;
    if (!host || typeof ResizeObserver === 'undefined') {
      return;
    }

    const scheduleMeasure = () => {
      if (resizeFrameRef.current != null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
      }
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        measureToastText();
      });
    };

    const observer = new ResizeObserver(() => {
      scheduleMeasure();
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      if (resizeFrameRef.current != null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      delete host.dataset.textSize;
    };
  }, [kind, measureToastText, notice.action?.label, notice.message]);

  const handleCopy = async () => {
    try {
      onPause?.();
      const payload = notice.detail ? `${notice.message}\n\n${notice.detail}` : notice.message;
      const ok = await copyText(payload);
      if (!ok) {
        onResume?.();
        return;
      }
      setCopied(true);
      if (copyResetTimerRef.current != null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = window.setTimeout(() => {
        copyResetTimerRef.current = null;
        setCopied(false);
      }, 1200);
      onResume?.();
    } catch {
      setCopied(false);
      onResume?.();
    }
  };

  if (kind === 'toast') {
    return (
      <div
        ref={ref}
        data-testid="toast"
        className="ui-toast"
        data-variant={notice.tone}
        data-tone={notice.tone}
        data-text-size={toastTextSize}
        {...(motionState ? { 'data-motion-state': motionState } : {})}
        tabIndex={-1}
        aria-live={notice.ariaLive}
        aria-atomic="true"
        role={notice.role}
        onMouseEnter={onPause}
        onMouseLeave={onResume}
        onFocusCapture={onPause}
        onBlurCapture={(event) => {
          const next = event.relatedTarget;
          if (!(next instanceof Node) || !ref.current?.contains(next)) {
            onResume?.();
          }
        }}
      >
        {notice.icon ? (
          <span className="ui-toast-icon" aria-hidden="true">
            <Icon name={notice.icon} size={16} />
          </span>
        ) : null}
        <div className="ui-toast-content">
          <span className="ui-toast-message-wrap">
            <span
              className="ui-toast-message"
              ref={messageRef}
              title={toastMessageTruncated ? notice.message : undefined}
            >
              {notice.message}
            </span>
          </span>
          {notice.action ? (
            <ActionButton
              className="ui-toast-action"
              quiet
              aria-label={notice.action.ariaLabel ?? notice.action.label}
              onClick={() => void notice.action?.onAction()}
            >
              {notice.action.label}
            </ActionButton>
          ) : null}
        </div>
        {typeof onClear === 'function' ? (
          <IconButton
            className="ui-toast-close"
            hostClassName="ui-toast-close-host"
            overlayClassName="ui-toast-close-overlay"
            quiet
            icon={<Icon name="close" size={12} />}
            tooltip="Dismiss"
            aria-label="Dismiss"
            onClick={onClear}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`status-notice ${inlineToneClass(notice.tone)}`}
      data-tone={notice.tone}
      aria-live={notice.ariaLive}
      aria-atomic="true"
      role={notice.role}
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocusCapture={onPause}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !ref.current?.contains(next)) {
          onResume?.();
        }
      }}
    >
      {notice.icon ? (
        <span className="status-icon" aria-hidden="true">
          <Icon name={notice.icon} size={14} />
        </span>
      ) : null}
      <div className="status-body">
        <div className="status-message">{notice.message}</div>
        {notice.detail ? <pre className="status-detail">{notice.detail}</pre> : null}
      </div>
      {notice.copyable || notice.detailCopyable ? (
        <IconButton
          className={`status-copy${copied ? ' cp' : ''}`}
          quiet
          icon={<Icon name={copied ? 'check' : 'copy'} />}
          tooltip="Copy status message"
          aria-label="Copy status message"
          onClick={() => void handleCopy()}
        />
      ) : null}
    </div>
  );
}
