import { useState } from 'react';
import { SI } from './icons';

export type StatusTone = 'success' | 'warning' | 'error' | 'info';

export interface StatusNoticeProps {
  readonly tone: StatusTone;
  readonly message: string;
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

export function StatusNotice({ tone, message }: StatusNoticeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const ok = await copyText(message);
      if (!ok) {
        return;
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`status-notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <pre className="status-message">{message}</pre>
      <button
        type="button"
        className={`status-copy${copied ? ' cp' : ''}`}
        aria-label="Copy status message"
        onClick={() => void handleCopy()}
      >
        <SI d={copied ? 'M20 6 9 17l-5-5' : ['M8 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z', 'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2']} />
      </button>
    </div>
  );
}
