import type { MotionHandle, MotionPreference, MotionRecipe, MotionRuntimeLike } from '../motion-types';
import { StaticMotionHandle } from '../motion-runtime';
import { MOTION_DURATION, MOTION_EASING, MOTION_OPACITY } from '../motion-tokens';
import { shouldReduceMotion } from '../motion-preference';
import { setElementOpacity } from './recipe-utils';

export function surfaceHighlightRecipe(
  element: HTMLElement | null,
  input: {
    readonly preference?: MotionPreference;
    readonly onComplete?: () => void;
  } = {},
): MotionRecipe {
  if (!element || shouldReduceMotion(input.preference)) {
    return {
      channel: 'highlight',
      run(): MotionHandle {
        setElementOpacity(element, MOTION_OPACITY.hidden);
        input.onComplete?.();
        return new StaticMotionHandle('highlight');
      },
    };
  }
  return {
    channel: 'highlight',
    run(runtime: MotionRuntimeLike): MotionHandle {
      setElementOpacity(element, 0.26);
      return runtime.playTween({
        channel: 'highlight',
        state: { opacity: 0.26 },
        to: { opacity: MOTION_OPACITY.hidden },
        durationMs: MOTION_DURATION.highlight,
        easing: MOTION_EASING.exit,
        onUpdate: (state) => setElementOpacity(element, state.opacity),
        onComplete: input.onComplete,
      });
    },
  };
}
