import type { MotionClock } from './motion-types';

function fallbackNow(): number {
  return Date.now();
}

export function createDomMotionClock(): MotionClock {
  const readNow = () => {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return fallbackNow();
  };

  const requestFrame = (callback: (time: number) => void) => {
    if (typeof requestAnimationFrame === 'function') {
      return requestAnimationFrame(callback);
    }
    return window.setTimeout(() => callback(readNow()), 16);
  };

  const cancelFrame = (id: number) => {
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(id);
      return;
    }
    window.clearTimeout(id);
  };

  const listenVisibility = (callback: (visible: boolean) => void) => {
    if (typeof document === 'undefined') {
      return () => undefined;
    }
    const listener = () => callback(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  };

  return { now: readNow, requestFrame, cancelFrame, listenVisibility };
}

export interface ManualMotionClock extends MotionClock {
  tick(ms: number): number;
  set(time: number): void;
}

export function createManualMotionClock(initialTime = 0): ManualMotionClock {
  let current = initialTime;
  return {
    now: () => current,
    tick: (ms: number) => {
      current += ms;
      return current;
    },
    set: (time: number) => {
      current = time;
    },
  };
}
