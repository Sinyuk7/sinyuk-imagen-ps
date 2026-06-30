import type { MotionPreference, MotionRecipe } from '../motion-types';
import { MOTION_DURATION, MOTION_OPACITY } from '../motion-tokens';
import { fadeRecipe } from './fade';

export function iconCrossfadeRecipe(
  element: HTMLElement | null,
  input: {
    readonly show: boolean;
    readonly durationMs?: number;
    readonly preference?: MotionPreference;
    readonly onComplete?: () => void;
  },
): MotionRecipe {
  return fadeRecipe(element, {
    from: input.show ? MOTION_OPACITY.hidden : MOTION_OPACITY.visible,
    to: input.show ? MOTION_OPACITY.visible : MOTION_OPACITY.hidden,
    durationMs: input.durationMs ?? MOTION_DURATION.direct,
    channel: 'state',
    preference: input.preference,
    onComplete: input.onComplete,
  });
}
