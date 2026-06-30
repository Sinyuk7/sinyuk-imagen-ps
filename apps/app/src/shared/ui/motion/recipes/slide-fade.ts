import type { MotionPreference, MotionRecipe } from '../motion-types';
import { MOTION_DURATION, MOTION_OPACITY, MOTION_TRANSLATE } from '../motion-tokens';
import { motionTranslateX, motionTranslateY } from '../motion-transform-guard';
import { tweenElementTransformRecipe } from './recipe-utils';

export function slideFadeRecipe(
  element: HTMLElement | null,
  input: {
    readonly direction?: 'up' | 'down' | 'left' | 'right';
    readonly enter?: boolean;
    readonly distancePx?: number;
    readonly durationMs?: number;
    readonly channel?: MotionRecipe['channel'];
    readonly preference?: MotionPreference;
    readonly onComplete?: () => void;
  } = {},
): MotionRecipe {
  const enter = input.enter ?? true;
  const direction = input.direction ?? 'up';
  const distance = Math.min(Math.abs(input.distancePx ?? MOTION_TRANSLATE.small), MOTION_TRANSLATE.medium);
  const sign = direction === 'up' || direction === 'left' ? 1 : -1;
  const translate = (offset: number) =>
    direction === 'left' || direction === 'right' ? motionTranslateX(offset) : motionTranslateY(offset);
  const startOffset = enter ? sign * distance : 0;
  const endOffset = enter ? 0 : sign * distance;

  return tweenElementTransformRecipe(
    element,
    {
      fromOpacity: enter ? MOTION_OPACITY.hidden : MOTION_OPACITY.visible,
      toOpacity: enter ? MOTION_OPACITY.visible : MOTION_OPACITY.hidden,
      fromTransform: (progress) => translate(startOffset + (endOffset - startOffset) * progress),
      toTransform: translate(endOffset),
    },
    {
      channel: input.channel ?? 'presence',
      durationMs: input.durationMs ?? (enter ? MOTION_DURATION.enter : MOTION_DURATION.exit),
      preference: input.preference,
      onComplete: input.onComplete,
    },
  );
}
