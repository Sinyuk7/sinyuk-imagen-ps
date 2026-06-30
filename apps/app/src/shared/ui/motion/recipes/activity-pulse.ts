import type { MotionHandle, MotionPreference, MotionRecipe, MotionRuntimeLike } from '../motion-types';
import { StaticMotionHandle } from '../motion-runtime';
import { MOTION_DURATION, MOTION_EASING, MOTION_OPACITY } from '../motion-tokens';
import { shouldReduceMotion } from '../motion-preference';
import { setElementOpacity } from './recipe-utils';

export function activityPulseRecipe(
  element: HTMLElement | null,
  input: {
    readonly minOpacity?: number;
    readonly maxOpacity?: number;
    readonly durationMs?: number;
    readonly preference?: MotionPreference;
  } = {},
): MotionRecipe {
  const minOpacity = input.minOpacity ?? 0.35;
  const maxOpacity = input.maxOpacity ?? MOTION_OPACITY.visible;
  if (!element || shouldReduceMotion(input.preference)) {
    return {
      channel: 'ambient',
      run(): MotionHandle {
        setElementOpacity(element, maxOpacity);
        return new StaticMotionHandle('ambient');
      },
    };
  }
  return {
    channel: 'ambient',
    run(runtime: MotionRuntimeLike): MotionHandle {
      setElementOpacity(element, maxOpacity);
      return runtime.playTween({
        channel: 'ambient',
        state: { opacity: minOpacity },
        to: { opacity: maxOpacity },
        durationMs: input.durationMs ?? MOTION_DURATION.pulse,
        easing: MOTION_EASING.linear,
        repeat: Infinity,
        yoyo: true,
        onUpdate: (state) => setElementOpacity(element, state.opacity),
      });
    },
  };
}
