import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { IconButton } from '../primitives/icon-button';

export type NoticeTone = 'positive' | 'negative' | 'warning' | 'info' | 'neutral';

export interface NoticeState {
  readonly message: string;
  readonly tone: NoticeTone;
}

export interface NoticeController {
  readonly notice: NoticeState | null;
  readonly show: (message: string, tone?: NoticeTone) => void;
  readonly clear: () => void;
}

interface UseNoticeOptions {
  readonly autoDismissMs?: number | null;
}

interface NoticeViewProps {
  readonly notice: NoticeState;
  readonly kind: 'toast' | 'inline';
  readonly onClear?: () => void;
  readonly motionState?: string;
}

function inlineToneClass(tone: NoticeTone): string {
  if (tone === 'positive') return 'success';
  if (tone === 'negative') return 'error';
  return tone;
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

export function useNotice({ autoDismissMs = null }: UseNoticeOptions = {}): NoticeController {
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    clearTimer();
    setNotice(null);
  }, [clearTimer]);

  const show = useCallback(
    (message: string, tone: NoticeTone = 'neutral') => {
      clearTimer();
      setNotice({ message, tone });
      if (autoDismissMs != null && autoDismissMs > 0) {
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          setNotice(null);
        }, autoDismissMs);
      }
    },
    [autoDismissMs, clearTimer],
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  return { notice, show, clear };
}

export function NoticeView({ notice, kind, onClear, motionState }: NoticeViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const ok = await copyText(notice.message);
      if (!ok) {
        return;
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  if (kind === 'toast') {
    return (
      <div
        data-testid="toast"
        className="ui-toast"
        data-variant={notice.tone}
        data-tone={notice.tone}
        {...(motionState ? { 'data-motion-state': motionState } : {})}
        tabIndex={-1}
        aria-live="polite"
        role={notice.tone === 'negative' ? 'alert' : 'status'}
      >
        <span className="ui-toast-message">{notice.message}</span>
        <button type="button" className="ui-toast-close" aria-label="Dismiss" onClick={onClear}>
          x
        </button>
      </div>
    );
  }

  return (
    <div className={`status-notice ${inlineToneClass(notice.tone)}`} data-tone={notice.tone} role={notice.tone === 'negative' ? 'alert' : 'status'}>
      <pre className="status-message">{notice.message}</pre>
      <IconButton
        className={`status-copy${copied ? ' cp' : ''}`}
        quiet
        icon={<Icon name={copied ? 'check' : 'copy'} />}
        tooltip="Copy status message"
        aria-label="Copy status message"
        onClick={() => void handleCopy()}
      />
    </div>
  );
}
