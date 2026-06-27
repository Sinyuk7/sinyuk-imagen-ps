import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSpectrumControls } from '../primitives/spectrum-controls';

/**
 * 主流程瞬时 Toast 的语义级别。Variant 名称依据本地 SWC 0.37.0 的
 * `ToastVariants = 'negative' | 'positive' | 'info' | 'error' | 'warning' | ''`。
 * `neutral` 对应空 variant（SWC 的中性样式）。
 */
export type ToastVariant = 'positive' | 'negative' | 'info' | 'neutral';

export interface ToastState {
  readonly message: string;
  readonly variant: ToastVariant;
}

export interface ToastController {
  readonly toast: ToastState | null;
  readonly show: (message: string, variant?: ToastVariant) => void;
  readonly close: () => void;
}

export interface ToastHostProps {
  readonly toast: ToastState | null;
  readonly onClose: () => void;
}

type ToastElement = HTMLElement & { open?: boolean };

const TOAST_TIMEOUT_MS = 2400;

/**
 * 轻量 Toast controller：单条瞬时消息 + 受控 timer。
 *
 * 解决旧实现的两个问题：
 *  1. 新 Toast 被旧 timeout 提前关闭的竞态 —— `show` 先 `clearTimer` 再写入状态。
 *  2. 连续消息覆盖时旧 timer 残留 —— `close` 与 `show` 共用同一个 timerRef，覆盖即清理。
 *
 * 不引入全局 Context / 队列 / 去重：当前只有 main-page 一处调用方。
 */
export function useToast(): ToastController {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const show = useCallback(
    (message: string, variant: ToastVariant = 'neutral') => {
      clearTimer();
      setToast({ message, variant });
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setToast(null);
      }, TOAST_TIMEOUT_MS);
    },
    [clearTimer],
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  return { toast, show, close };
}

/**
 * Toast 视图宿主。`open` 与自动关闭由 controller 的 timer 管理，不使用 `sp-toast`
 * 自身的 `timeout`，避免双重定时器。`sp-toast` 内置 close button 触发 `close` 事件，
 * 通过 ref 监听交回 controller（手动关闭）。
 */
export function ToastHost({ toast, onClose }: ToastHostProps) {
  registerSpectrumControls();
  const ref = useRef<ToastElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    el.open = true;
    const handler = () => onClose();
    el.addEventListener('close', handler);
    return () => {
      el.removeEventListener('close', handler);
    };
  }, [onClose, toast]);

  if (!toast) {
    return null;
  }

  const variant = toast.variant === 'neutral' ? undefined : toast.variant;

  return (
    <sp-toast data-testid="toast" ref={ref} variant={variant} tabIndex={-1} aria-live="polite">
      {toast.message}
    </sp-toast>
  );
}
