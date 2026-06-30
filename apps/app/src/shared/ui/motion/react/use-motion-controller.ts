import { useEffect, useRef } from 'react';
import { MotionController } from '../motion-controller';
import { getSharedMotionRuntime } from '../motion-runtime';

export function useMotionController(): MotionController {
  const ref = useRef<MotionController | null>(null);
  ref.current ??= new MotionController(getSharedMotionRuntime());

  useEffect(() => () => ref.current?.stop(), []);

  return ref.current;
}
