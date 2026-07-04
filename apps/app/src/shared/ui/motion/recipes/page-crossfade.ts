import type { MotionPreference, MotionRecipe } from '../motion-types';
import { MOTION_DURATION, MOTION_OPACITY } from '../motion-tokens';
import { fadeRecipe } from './fade';

export function pageCrossfadeRecipe(
  element: HTMLElement | null,
  input: {
    readonly enter: boolean;
    readonly direction?: 'left' | 'right' | 'up' | 'down';
    readonly preference?: MotionPreference;
    readonly onComplete?: () => void;
  },
): MotionRecipe {
  return fadeRecipe(element, {
    from: input.enter ? MOTION_OPACITY.hidden : MOTION_OPACITY.visible,
    to: input.enter ? MOTION_OPACITY.visible : MOTION_OPACITY.hidden,
    durationMs: input.enter ? MOTION_DURATION.page : MOTION_DURATION.exit,
    channel: 'presence',
    preference: input.preference,
    onComplete: input.onComplete,
  });
}
