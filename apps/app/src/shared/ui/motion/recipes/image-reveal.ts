import type { MotionPreference, MotionRecipe } from '../motion-types';
import { MOTION_DURATION, MOTION_OPACITY } from '../motion-tokens';
import { fadeRecipe } from './fade';

export function imageRevealRecipe(
  element: HTMLElement | null,
  input: {
    readonly preference?: MotionPreference;
    readonly onComplete?: () => void;
  } = {},
): MotionRecipe {
  return fadeRecipe(element, {
    from: MOTION_OPACITY.hidden,
    to: MOTION_OPACITY.visible,
    durationMs: MOTION_DURATION.reveal,
    channel: 'state',
    preference: input.preference,
    onComplete: input.onComplete,
  });
}
