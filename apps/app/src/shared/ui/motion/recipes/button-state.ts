import type { MotionPreference, MotionRecipe } from '../motion-types';
import { MOTION_DURATION, MOTION_SCALE } from '../motion-tokens';
import { motionScale } from '../motion-transform-guard';
import { tweenElementTransformRecipe } from './recipe-utils';

export function buttonStateRecipe(
  element: HTMLElement | null,
  input: {
    readonly pressed?: boolean;
    readonly preference?: MotionPreference;
    readonly onComplete?: () => void;
  } = {},
): MotionRecipe {
  const pressed = input.pressed ?? true;
  const startScale = pressed ? 1 : MOTION_SCALE.press;
  const endScale = pressed ? MOTION_SCALE.press : 1;
  return tweenElementTransformRecipe(
    element,
    {
      fromTransform: (progress) => motionScale(startScale + (endScale - startScale) * progress),
      toTransform: motionScale(endScale),
    },
    {
      channel: 'state',
      durationMs: MOTION_DURATION.direct,
      preference: input.preference,
      onComplete: input.onComplete,
    },
  );
}
