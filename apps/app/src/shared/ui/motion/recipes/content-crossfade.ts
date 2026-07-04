import type { MotionPreference, MotionRecipe } from '../motion-types';
import { MOTION_DURATION, MOTION_OPACITY } from '../motion-tokens';
import { fadeRecipe } from './fade';

export function contentCrossfadeRecipe(
  element: HTMLElement | null,
  input: {
    readonly visible?: boolean;
    readonly preference?: MotionPreference;
    readonly onComplete?: () => void;
  } = {},
): MotionRecipe {
  const visible = input.visible ?? true;
  return fadeRecipe(element, {
    from: visible ? MOTION_OPACITY.hidden : MOTION_OPACITY.visible,
    to: visible ? MOTION_OPACITY.visible : MOTION_OPACITY.hidden,
    durationMs: MOTION_DURATION.content,
    channel: 'state',
    preference: input.preference,
    onComplete: input.onComplete,
  });
}
