import type { MotionPreference, MotionRecipe } from '../motion-types';
import { MOTION_DURATION } from '../motion-tokens';
import { tweenElementOpacityRecipe } from './recipe-utils';

export function fadeRecipe(
  element: HTMLElement | null,
  input: {
    readonly from: number;
    readonly to: number;
    readonly durationMs?: number;
    readonly channel?: MotionRecipe['channel'];
    readonly preference?: MotionPreference;
    readonly onComplete?: () => void;
  },
): MotionRecipe {
  return tweenElementOpacityRecipe(element, input.from, input.to, {
    channel: input.channel ?? 'state',
    durationMs: input.durationMs ?? MOTION_DURATION.content,
    preference: input.preference,
    onComplete: input.onComplete,
  });
}
