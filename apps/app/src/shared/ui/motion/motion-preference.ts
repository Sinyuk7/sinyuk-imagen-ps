import type { MotionPreference } from './motion-types';

export function resolveMotionPreference(preference: MotionPreference = 'system'): 'reduce' | 'full' {
  if (preference === 'reduce' || preference === 'full') {
    return preference;
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'full';
  }
  return 'full';
}

export function shouldReduceMotion(preference: MotionPreference = 'system'): boolean {
  return resolveMotionPreference(preference) === 'reduce';
}
