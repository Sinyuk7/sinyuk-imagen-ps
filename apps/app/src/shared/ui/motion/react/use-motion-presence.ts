import { useEffect, useRef, useState } from 'react';
import type { MotionHandle, MotionPreference, MotionRecipe } from '../motion-types';
import { MotionController } from '../motion-controller';
import { getSharedMotionRuntime } from '../motion-runtime';

export type UseMotionPresenceRecipe = (
  element: HTMLElement | null,
  input: {
    readonly enter: boolean;
    readonly preference?: MotionPreference;
    readonly onComplete?: () => void;
  },
) => MotionRecipe;

export function useMotionPresence(
  visible: boolean,
  createRecipe: UseMotionPresenceRecipe,
  input: { readonly preference?: MotionPreference; readonly onExitComplete?: () => void } = {},
): {
  readonly present: boolean;
  readonly state: 'entering' | 'entered' | 'exiting';
  readonly ref: (element: HTMLElement | null) => void;
} {
  const [present, setPresent] = useState(visible);
  const [state, setState] = useState<'entering' | 'entered' | 'exiting'>(visible ? 'entered' : 'exiting');
  const elementRef = useRef<HTMLElement | null>(null);
  const handleRef = useRef<MotionHandle | null>(null);
  const controllerRef = useRef<MotionController | null>(null);
  controllerRef.current ??= new MotionController(getSharedMotionRuntime());

  useEffect(() => {
    if (visible) {
      setPresent(true);
      return;
    }
    if (present) {
      setState('exiting');
    }
  }, [present, visible]);

  useEffect(() => {
    if (!present) {
      return undefined;
    }
    const controller = controllerRef.current;
    if (!controller) {
      return undefined;
    }
    handleRef.current?.stop();
    const enter = visible;
    setState(enter ? 'entering' : 'exiting');
    handleRef.current = controller.play(createRecipe(elementRef.current, {
      enter,
      preference: input.preference,
      onComplete: () => {
        setState(enter ? 'entered' : 'exiting');
        if (!enter) {
          setPresent(false);
          input.onExitComplete?.();
        }
      },
    }));
    return () => handleRef.current?.stop();
  }, [createRecipe, input.onExitComplete, input.preference, present, visible]);

  return {
    present,
    state,
    ref: (element) => {
      elementRef.current = element;
    },
  };
}
