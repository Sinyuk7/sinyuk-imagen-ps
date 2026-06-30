import type { Easing } from '@tweenjs/tween.js';

export type MotionChannel = 'presence' | 'state' | 'highlight' | 'ambient';

export type MotionPreference = 'system' | 'reduce' | 'full';

export type MotionEasing = (typeof Easing)[keyof typeof Easing][keyof (typeof Easing)[keyof typeof Easing]];

export interface MotionHandle {
  readonly channel: MotionChannel;
  stop(): void;
  finish(): void;
  isRunning(): boolean;
}

export interface MotionRecipe {
  readonly channel: MotionChannel;
  run(runtime: MotionRuntimeLike): MotionHandle;
}

export interface MotionRuntimeLike {
  now(): number;
  activeCount(): number;
  playTween<T extends Record<string, number>>(input: MotionTweenInput<T>): MotionHandle;
}

export interface MotionTweenInput<T extends Record<string, number>> {
  readonly channel: MotionChannel;
  readonly state: T;
  readonly to: Partial<T>;
  readonly durationMs: number;
  readonly easing: (amount: number) => number;
  readonly repeat?: number;
  readonly yoyo?: boolean;
  readonly delayMs?: number;
  readonly onUpdate: (state: T) => void;
  readonly onComplete?: () => void;
  readonly onStop?: () => void;
}

export interface MotionClock {
  now(): number;
  requestFrame?: (callback: (time: number) => void) => number;
  cancelFrame?: (id: number) => void;
  listenVisibility?: (callback: (visible: boolean) => void) => () => void;
}

export interface MotionDebugSnapshot {
  readonly activeTweenCount: number;
  readonly schedulerState: 'idle' | 'running' | 'frozen';
  readonly orphanCount: number;
}
