import { useEffect, useState } from 'react';
import { resolveMotionPreference } from '../motion-preference';
import type { MotionPreference } from '../motion-types';

export function useMotionPreference(preference: MotionPreference = 'system'): 'reduce' | 'full' {
  const [resolved, setResolved] = useState(() => resolveMotionPreference(preference));

  useEffect(() => {
    if (preference !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setResolved(resolveMotionPreference(preference));
      return undefined;
    }
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setResolved(query.matches ? 'reduce' : 'full');
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, [preference]);

  return resolved;
}
