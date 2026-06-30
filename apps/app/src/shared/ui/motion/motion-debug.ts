import { getSharedMotionRuntime } from './motion-runtime';
import type { MotionDebugSnapshot } from './motion-types';

export function readMotionDebugSnapshot(): MotionDebugSnapshot {
  return getSharedMotionRuntime().debugSnapshot();
}
