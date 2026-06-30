import type { MotionPreference, MotionRecipe } from '../motion-types';
import { MOTION_DURATION, MOTION_TRANSLATE } from '../motion-tokens';
import { slideFadeRecipe } from './slide-fade';

export function pageCrossfadeRecipe(
  element: HTMLElement | null,
  input: {
    readonly enter: boolean;
    readonly direction?: 'left' | 'right' | 'up' | 'down';
    readonly preference?: MotionPreference;
    readonly onComplete?: () => void;
  },
): MotionRecipe {
  return slideFadeRecipe(element, {
    enter: input.enter,
    direction: input.direction ?? 'up',
    distancePx: MOTION_TRANSLATE.micro,
    durationMs: input.enter ? MOTION_DURATION.reveal : MOTION_DURATION.exit,
    channel: 'presence',
    preference: input.preference,
    onComplete: input.onComplete,
  });
}
