import type { MotionPreference, MotionRecipe } from '../motion-types';
import { MOTION_DURATION, MOTION_SCALE, MOTION_TRANSLATE } from '../motion-tokens';
import { motionScale, motionTranslateY } from '../motion-transform-guard';
import { tweenElementTransformRecipe } from './recipe-utils';

export function attachmentPresenceRecipe(
  element: HTMLElement | null,
  input: {
    readonly enter: boolean;
    readonly preference?: MotionPreference;
    readonly onComplete?: () => void;
  },
): MotionRecipe {
  const startOffset = input.enter ? MOTION_TRANSLATE.micro : 0;
  const endOffset = input.enter ? 0 : MOTION_TRANSLATE.micro;
  const startScale = input.enter ? MOTION_SCALE.subtleIn : 1;
  const endScale = input.enter ? 1 : MOTION_SCALE.subtleIn;
  return tweenElementTransformRecipe(
    element,
    {
      fromOpacity: input.enter ? 0 : 1,
      toOpacity: input.enter ? 1 : 0,
      fromTransform: (progress) => {
        const offset = startOffset + (endOffset - startOffset) * progress;
        const scale = startScale + (endScale - startScale) * progress;
        return `${motionTranslateY(offset)} ${motionScale(scale)}`;
      },
      toTransform: `${motionTranslateY(endOffset)} ${motionScale(endScale)}`,
    },
    {
      channel: 'presence',
      durationMs: input.enter ? MOTION_DURATION.enter : MOTION_DURATION.exit,
      preference: input.preference,
      onComplete: input.onComplete,
    },
  );
}
