import type { MotionPreference, MotionRecipe } from '../motion-types';
import { MOTION_DURATION, MOTION_TRANSLATE } from '../motion-tokens';
import { slideFadeRecipe } from './slide-fade';

export function toastPresenceRecipe(
  element: HTMLElement | null,
  input: {
    readonly enter: boolean;
    readonly preference?: MotionPreference;
    readonly onComplete?: () => void;
  },
): MotionRecipe {
  return slideFadeRecipe(element, {
    enter: input.enter,
    direction: input.enter ? 'down' : 'up',
    distancePx: MOTION_TRANSLATE.small,
    durationMs: input.enter ? MOTION_DURATION.enter : MOTION_DURATION.exit,
    channel: 'presence',
    preference: input.preference,
    onComplete: input.onComplete,
  });
}
