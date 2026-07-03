import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MotionPresenceView } from './motion-ui';
import { NoticeView, createNoticeState, type NoticeController, type NoticeOptions, type NoticeRole, type NoticeState, type NoticeTone } from './notice';

/**
 * 主流程瞬时 Toast 的语义级别。
 */
export type ToastVariant = NoticeTone;
export type ToastOptions = NoticeOptions;
export type ToastState = NoticeState;
export interface ToastController extends NoticeController {
  readonly toast: ToastState | null;
  readonly close: () => void;
}

interface ToastProviderProps {
  readonly children: ReactNode;
}

interface ToastHostProps {
  readonly toast: ToastState | null;
  readonly onClose: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
}

type ManagedToastState = ToastState & {
  readonly key: string;
  readonly priority: number;
  readonly order: number;
};

interface ToastStore {
  readonly current: ManagedToastState | null;
  readonly queue: readonly ManagedToastState[];
}

const TOAST_QUEUE_MAX = 2;

const TOAST_PRIORITY: Record<ToastVariant, number> = {
  neutral: 0,
  positive: 1,
  info: 2,
  warning: 3,
  negative: 4,
};

const TOAST_DURATION_MS: Record<ToastVariant, number> = {
  positive: 2200,
  neutral: 2600,
  info: 3200,
  warning: 5000,
  negative: 6800,
};

const EMPTY_STORE: ToastStore = {
  current: null,
  queue: [],
};

const ToastContext = createContext<ToastController | null>(null);

function pickNextToast(queue: readonly ManagedToastState[]): {
  readonly current: ManagedToastState | null;
  readonly queue: readonly ManagedToastState[];
} {
  if (queue.length === 0) {
    return EMPTY_STORE;
  }
  let bestIndex = 0;
  for (let index = 1; index < queue.length; index += 1) {
    const candidate = queue[index]!;
    const best = queue[bestIndex]!;
    if (candidate.priority > best.priority || (candidate.priority === best.priority && candidate.order < best.order)) {
      bestIndex = index;
    }
  }
  return {
    current: queue[bestIndex] ?? null,
    queue: queue.filter((_, index) => index !== bestIndex),
  };
}

function trimQueue(queue: readonly ManagedToastState[]): readonly ManagedToastState[] {
  let next = [...queue];
  while (next.length > TOAST_QUEUE_MAX) {
    let dropIndex = 0;
    for (let index = 1; index < next.length; index += 1) {
      const candidate = next[index]!;
      const dropped = next[dropIndex]!;
      if (candidate.priority < dropped.priority || (candidate.priority === dropped.priority && candidate.order < dropped.order)) {
        dropIndex = index;
      }
    }
    next = next.filter((_, index) => index !== dropIndex);
  }
  return next;
}

function replaceQueueToast(
  queue: readonly ManagedToastState[],
  nextToast: ManagedToastState,
): readonly ManagedToastState[] | null {
  const targetIndex = queue.findIndex((item) => item.key === nextToast.key);
  if (targetIndex < 0) {
    return null;
  }
  return queue.map((item, index) => (index === targetIndex ? { ...nextToast, order: item.order } : item));
}

function defaultDismissible(tone: ToastVariant, durationMs: number | null): boolean {
  if (durationMs == null || durationMs <= 0) {
    return true;
  }
  return tone === 'warning' || tone === 'negative';
}

function createManagedToast(
  message: string,
  tone: ToastVariant,
  options: ToastOptions | undefined,
  order: number,
): ManagedToastState {
  const durationMs = options?.durationMs === undefined ? TOAST_DURATION_MS[tone] : options.durationMs;
  const role: NoticeRole = options?.role ?? (options?.urgent ? 'alert' : 'status');
  const ariaLive = options?.ariaLive ?? (options?.urgent ? 'assertive' : 'polite');
  const toast = createNoticeState(
    message,
    tone,
    {
      ...options,
      durationMs,
      role,
      ariaLive,
      dismissible: options?.dismissible ?? defaultDismissible(tone, durationMs ?? null),
    },
    durationMs ?? null,
  );
  return {
    ...toast,
    key: options?.key ?? `${tone}:${message}`,
    priority: options?.priority ?? TOAST_PRIORITY[tone],
    order,
  };
}

function createNextStore(store: ToastStore, nextToast: ManagedToastState): {
  readonly store: ToastStore;
  readonly restartTimer: boolean;
} {
  if (!store.current) {
    return {
      store: { current: nextToast, queue: [] },
      restartTimer: true,
    };
  }
  if (store.current.key === nextToast.key) {
    return {
      store: {
        current: { ...nextToast, order: store.current.order },
        queue: store.queue.filter((item) => item.key !== nextToast.key),
      },
      restartTimer: true,
    };
  }

  const replacedQueue = replaceQueueToast(store.queue, nextToast);
  if (replacedQueue) {
    return {
      store: {
        current: store.current,
        queue: trimQueue(replacedQueue),
      },
      restartTimer: false,
    };
  }

  if (nextToast.priority > store.current.priority) {
    return {
      store: {
        current: nextToast,
        queue: store.queue.filter((item) => item.key !== nextToast.key),
      },
      restartTimer: true,
    };
  }

  return {
    store: {
      current: store.current,
      queue: trimQueue([...store.queue, nextToast]),
    },
    restartTimer: false,
  };
}

function useToastController(): ToastController {
  const [store, setStore] = useState<ToastStore>(EMPTY_STORE);
  const storeRef = useRef<ToastStore>(EMPTY_STORE);
  const orderRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const remainingMsRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const pausedRef = useRef(false);

  const syncStore = useCallback((nextStore: ToastStore) => {
    storeRef.current = nextStore;
    setStore(nextStore);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startedAtRef.current = null;
  }, []);

  const advance = useCallback(() => {
    clearTimer();
    pausedRef.current = false;
    remainingMsRef.current = null;
    const next = pickNextToast(storeRef.current.queue);
    syncStore(next);
  }, [clearTimer, syncStore]);

  const armTimer = useCallback((durationMs: number | null | undefined) => {
    clearTimer();
    if (durationMs == null || durationMs <= 0) {
      remainingMsRef.current = null;
      return;
    }
    remainingMsRef.current = durationMs;
    startedAtRef.current = Date.now();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      startedAtRef.current = null;
      advance();
    }, durationMs);
  }, [advance, clearTimer]);

  const applyStore = useCallback((nextStore: ToastStore, restartTimer: boolean) => {
    syncStore(nextStore);
    if (!restartTimer) {
      return;
    }
    pausedRef.current = false;
    armTimer(nextStore.current?.durationMs);
  }, [armTimer, syncStore]);

  const clear = useCallback(() => {
    advance();
  }, [advance]);

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
    (message: string, tone: ToastVariant = 'neutral', options?: ToastOptions) => {
      const nextToast = createManagedToast(message, tone, options, orderRef.current);
      orderRef.current += 1;
      const next = createNextStore(storeRef.current, nextToast);
      applyStore(next.store, next.restartTimer);
    },
    [applyStore],
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  return useMemo(() => ({
    notice: store.current,
    toast: store.current,
    show,
    clear,
    close: clear,
    pause,
    resume,
  }), [clear, pause, resume, show, store.current]);
}

export function ToastProvider({ children }: ToastProviderProps) {
  const controller = useToastController();
  return <ToastContext.Provider value={controller}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastController {
  const controller = useContext(ToastContext);
  if (!controller) {
    throw new Error('useToast must be used within <ToastProvider>.');
  }
  return controller;
}

/**
 * Toast 视图宿主。`open` 与自动关闭由全局 controller 的 timer 管理。
 */
function ToastHostView({ toast, onClose, onPause, onResume }: ToastHostProps) {
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

export function ToastHost() {
  const controller = useToast();
  return (
    <ToastHostView
      toast={controller.toast}
      onClose={controller.close}
      onPause={controller.pause}
      onResume={controller.resume}
    />
  );
}
