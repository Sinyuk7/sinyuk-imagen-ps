import { useEffect, useRef, useState } from 'react';
import { MotionPresenceView } from './motion-ui';
import { NoticeView, useNotice, type NoticeController, type NoticeState, type NoticeTone } from './notice';

/**
 * 主流程瞬时 Toast 的语义级别。
 */
export type ToastVariant = NoticeTone;
export type ToastState = NoticeState;
export interface ToastController extends NoticeController {
  readonly toast: ToastState | null;
  readonly close: () => void;
}

export interface ToastHostProps {
  readonly toast: ToastState | null;
  readonly onClose: () => void;
  readonly onPause?: () => void;
  readonly onResume?: () => void;
}

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
  const controller = useNotice({ defaultDurationMs: TOAST_TIMEOUT_MS });
  return {
    ...controller,
    toast: controller.notice,
    close: controller.clear,
  };
}

/**
 * Toast 视图宿主。`open` 与自动关闭由 controller 的 timer 管理。
 */
export function ToastHost({ toast, onClose, onPause, onResume }: ToastHostProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [renderedToast, setRenderedToast] = useState<ToastState | null>(toast);

  useEffect(() => {
    if (toast) {
      setRenderedToast(toast);
    }
  }, [toast]);

  if (!toast && !renderedToast) {
    return null;
  }

  return (
    <MotionPresenceView visible={Boolean(toast)} kind="toast">
      {({ ref: motionRef, state }) => {
        const current = toast ?? renderedToast;
        if (!current) {
          return null;
        }
        return (
          <div
            className="ui-toast-shell"
            ref={(element) => {
              ref.current = element;
              motionRef(element);
              if (!element && !toast) {
                setRenderedToast(null);
              }
            }}
          >
            <NoticeView notice={current} kind="toast" motionState={state} onClear={onClose} onPause={onPause} onResume={onResume} />
          </div>
        );
      }}
    </MotionPresenceView>
  );
}
