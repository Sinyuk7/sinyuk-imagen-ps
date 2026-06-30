import { Group, Tween } from '@tweenjs/tween.js';
import { createDomMotionClock } from './motion-clock';
import type { MotionClock, MotionDebugSnapshot, MotionHandle, MotionTweenInput } from './motion-types';

class RuntimeMotionHandle<T extends Record<string, number>> implements MotionHandle {
  private running = true;

  constructor(
    readonly channel: MotionHandle['channel'],
    private readonly tween: Tween<T>,
    private readonly cleanup: (handle: MotionHandle) => void,
  ) {}

  stop(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.tween.stop();
    this.cleanup(this);
  }

  finish(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.tween.end();
    this.cleanup(this);
  }

  pause(time: number): void {
    if (this.running) {
      this.tween.pause(time);
    }
  }

  resume(time: number): void {
    if (this.running) {
      this.tween.resume(time);
    }
  }

  markComplete(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.cleanup(this);
  }

  isRunning(): boolean {
    return this.running;
  }
}

export class StaticMotionHandle implements MotionHandle {
  private running = false;

  constructor(readonly channel: MotionHandle['channel']) {}

  stop(): void {
    this.running = false;
  }

  finish(): void {
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }
}

export class MotionRuntime {
  readonly group = new Group();
  private readonly handles = new Set<MotionHandle>();
  private frameId: number | null = null;
  private frozen = false;
  private disposed = false;
  private readonly disposeVisibility?: () => void;

  constructor(private readonly clock: MotionClock = createDomMotionClock()) {
    this.disposeVisibility = this.clock.listenVisibility?.((visible) => {
      this.setFrozen(!visible);
    });
  }

  now(): number {
    return this.clock.now();
  }

  playTween<T extends Record<string, number>>(input: MotionTweenInput<T>): MotionHandle {
    const tween = new Tween(input.state, this.group)
      .to(input.to, input.durationMs)
      .easing(input.easing)
      .onUpdate((state) => input.onUpdate(state))
      .onComplete(() => {
        input.onComplete?.();
        handle.markComplete();
      })
      .onStop(() => {
        input.onStop?.();
        handle.markComplete();
      });

    if (input.repeat !== undefined) {
      tween.repeat(input.repeat);
    }
    if (input.yoyo !== undefined) {
      tween.yoyo(input.yoyo);
    }
    if (input.delayMs !== undefined) {
      tween.delay(input.delayMs);
    }

    const handle = new RuntimeMotionHandle<T>(input.channel, tween, (item) => {
      this.handles.delete(item);
      this.group.remove(tween);
      this.scheduleIfNeeded();
    });
    this.handles.add(handle);
    tween.start(this.clock.now());
    this.scheduleIfNeeded();
    return handle;
  }

  update(time = this.clock.now()): void {
    if (this.disposed || this.frozen) {
      return;
    }
    this.group.update(time, false);
    this.scheduleIfNeeded();
  }

  activeCount(): number {
    return this.handles.size;
  }

  debugSnapshot(): MotionDebugSnapshot {
    return {
      activeTweenCount: this.handles.size,
      schedulerState: this.frozen ? 'frozen' : this.frameId === null ? 'idle' : 'running',
      orphanCount: Math.max(0, this.group.getAll().length - this.handles.size),
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.frameId !== null && this.clock.cancelFrame) {
      this.clock.cancelFrame(this.frameId);
    }
    this.frameId = null;
    this.disposeVisibility?.();
    this.group.removeAll();
    this.handles.clear();
  }

  private setFrozen(next: boolean): void {
    if (this.frozen === next) {
      return;
    }
    this.frozen = next;
    const time = this.clock.now();
    for (const handle of this.handles) {
      if (!(handle instanceof RuntimeMotionHandle)) {
        continue;
      }
      if (next) {
        handle.pause(time);
      } else {
        handle.resume(time);
      }
    }
    if (next && this.frameId !== null && this.clock.cancelFrame) {
      this.clock.cancelFrame(this.frameId);
      this.frameId = null;
    }
    if (!next) {
      this.scheduleIfNeeded();
    }
  }

  private scheduleIfNeeded(): void {
    if (
      this.disposed ||
      this.frozen ||
      this.frameId !== null ||
      this.handles.size === 0 ||
      !this.clock.requestFrame
    ) {
      return;
    }
    this.frameId = this.clock.requestFrame((time) => {
      this.frameId = null;
      this.update(time);
    });
  }
}

let sharedRuntime: MotionRuntime | undefined;

export function getSharedMotionRuntime(): MotionRuntime {
  sharedRuntime ??= new MotionRuntime();
  return sharedRuntime;
}
