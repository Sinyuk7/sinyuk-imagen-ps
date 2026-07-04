import type { MotionHandle, MotionPreference, MotionRecipe, MotionRuntimeLike } from '../motion-types';
import { StaticMotionHandle } from '../motion-runtime';
import { MOTION_DURATION, MOTION_EASING, MOTION_OPACITY } from '../motion-tokens';
import { shouldReduceMotion } from '../motion-preference';
import { applyMotionTransform } from '../motion-transform-guard';

export interface ElementMotionOptions {
  readonly channel?: MotionRecipe['channel'];
  readonly durationMs?: number;
  readonly preference?: MotionPreference;
  readonly onComplete?: () => void;
}

export function setElementOpacity(element: HTMLElement | null, value: number): void {
  if (!element) {
    return;
  }
  element.style.opacity = String(Number(value.toFixed(3)));
}

export function setElementTransform(element: HTMLElement | null, value: string): boolean {
  if (!element) {
    return false;
  }
  return applyMotionTransform(element, value);
}

export function setElementInteractive(element: HTMLElement | null, interactive: boolean): void {
  if (!element) {
    return;
  }
  element.style.pointerEvents = interactive ? '' : 'none';
}

export function staticElementRecipe(
  channel: MotionRecipe['channel'],
  apply: () => void,
  onComplete?: () => void,
): MotionRecipe {
  return {
    channel,
    run(): MotionHandle {
      apply();
      onComplete?.();
      return new StaticMotionHandle(channel);
    },
  };
}

export function tweenElementOpacityRecipe(
  element: HTMLElement | null,
  from: number,
  to: number,
  options: ElementMotionOptions = {},
): MotionRecipe {
  const channel = options.channel ?? 'state';
  if (!element || shouldReduceMotion(options.preference)) {
    return staticElementRecipe(channel, () => setElementOpacity(element, to), options.onComplete);
  }
  return {
    channel,
    run(runtime: MotionRuntimeLike): MotionHandle {
      setElementOpacity(element, from);
      return runtime.playTween({
        channel,
        state: { opacity: from },
        to: { opacity: to },
        durationMs: options.durationMs ?? MOTION_DURATION.content,
        easing: to >= from ? MOTION_EASING.enter : MOTION_EASING.exit,
        onUpdate: (state) => setElementOpacity(element, state.opacity),
        onComplete: options.onComplete,
      });
    },
  };
}

export function tweenElementTransformRecipe(
  element: HTMLElement | null,
  input: {
    readonly fromOpacity?: number;
    readonly toOpacity?: number;
    readonly fromTransform: (progress: number) => string;
    readonly toTransform: string;
  },
  options: ElementMotionOptions = {},
): MotionRecipe {
  const channel = options.channel ?? 'state';
  if (!element || shouldReduceMotion(options.preference)) {
    return staticElementRecipe(
      channel,
      () => {
        if (input.toOpacity !== undefined) {
          setElementOpacity(element, input.toOpacity);
        }
        setElementTransform(element, input.toTransform);
      },
      options.onComplete,
    );
  }

  return {
    channel,
    run(runtime: MotionRuntimeLike): MotionHandle {
      if (input.fromOpacity !== undefined) {
        setElementOpacity(element, input.fromOpacity);
      }
      setElementTransform(element, input.fromTransform(0));
      return runtime.playTween({
        channel,
        state: { progress: 0 },
        to: { progress: 1 },
        durationMs: options.durationMs ?? MOTION_DURATION.enter,
        easing: MOTION_EASING.enter,
        onUpdate: (state) => {
          if (input.fromOpacity !== undefined && input.toOpacity !== undefined) {
            setElementOpacity(element, input.fromOpacity + (input.toOpacity - input.fromOpacity) * state.progress);
          }
          setElementTransform(element, input.fromTransform(state.progress));
        },
        onComplete: () => {
          if (input.toOpacity !== undefined) {
            setElementOpacity(element, input.toOpacity);
          }
          setElementTransform(element, input.toTransform);
          options.onComplete?.();
        },
      });
    },
  };
}

export function opacityVisible(visible: boolean): number {
  return visible ? MOTION_OPACITY.visible : MOTION_OPACITY.hidden;
}
