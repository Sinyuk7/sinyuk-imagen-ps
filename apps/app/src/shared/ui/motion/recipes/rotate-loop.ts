import type { MotionHandle, MotionRecipe } from '../motion-types';
import { StaticMotionHandle } from '../motion-runtime';

export function rotateLoopRecipe(): MotionRecipe {
  return {
    channel: 'ambient',
    run(): MotionHandle {
      return new StaticMotionHandle('ambient');
    },
  };
}
