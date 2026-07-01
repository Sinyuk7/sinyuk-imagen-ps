import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './icons';
import { IconButton } from '../primitives/icon-button';

export type NoticeTone = 'positive' | 'negative' | 'warning' | 'info' | 'neutral';
export type NoticeRole = 'status' | 'alert';
export type NoticeAriaLive = 'polite' | 'assertive';

export interface NoticeOptions {
  readonly dismissible?: boolean;
  readonly copyable?: boolean;
  readonly durationMs?: number | null;
  readonly role?: NoticeRole;
  readonly ariaLive?: NoticeAriaLive;
  readonly icon?: IconName | null;
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

function createNoticeState(
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
    durationMs: options?.durationMs ?? defaultDurationMs,
    role: options?.role ?? defaultRole(tone),
    ariaLive: options?.ariaLive ?? defaultAriaLive(tone),
    icon: options?.icon === undefined ? defaultIcon(tone) : options.icon,
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
  const copyResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current != null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    try {
      onPause?.();
      const ok = await copyText(notice.message);
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
        <span className="ui-toast-message">{notice.message}</span>
        {notice.dismissible && typeof onClear === 'function' ? (
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
      <pre className="status-message">{notice.message}</pre>
      {notice.copyable ? (
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
