import type { MotionPreference, MotionRecipe } from '../motion-types';
import { MOTION_DURATION, MOTION_OPACITY, MOTION_SCALE } from '../motion-tokens';
import { motionScale } from '../motion-transform-guard';
import { tweenElementTransformRecipe } from './recipe-utils';

export function scalePopRecipe(
  element: HTMLElement | null,
  input: {
    readonly enter?: boolean;
    readonly fromScale?: number;
    readonly durationMs?: number;
    readonly channel?: MotionRecipe['channel'];
    readonly preference?: MotionPreference;
    readonly onComplete?: () => void;
  } = {},
): MotionRecipe {
  const enter = input.enter ?? true;
  const fromScale = Math.max(input.fromScale ?? MOTION_SCALE.subtleIn, MOTION_SCALE.emphasisIn);
  const startScale = enter ? fromScale : 1;
  const endScale = enter ? 1 : fromScale;

  return tweenElementTransformRecipe(
    element,
    {
      fromOpacity: enter ? MOTION_OPACITY.hidden : MOTION_OPACITY.visible,
      toOpacity: enter ? MOTION_OPACITY.visible : MOTION_OPACITY.hidden,
      fromTransform: (progress) => motionScale(startScale + (endScale - startScale) * progress),
      toTransform: motionScale(endScale),
    },
    {
      channel: input.channel ?? 'presence',
      durationMs: input.durationMs ?? (enter ? MOTION_DURATION.enter : MOTION_DURATION.exit),
      preference: input.preference,
      onComplete: input.onComplete,
    },
  );
}
