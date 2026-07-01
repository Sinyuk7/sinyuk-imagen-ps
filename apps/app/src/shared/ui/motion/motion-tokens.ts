import { Easing } from '@tweenjs/tween.js';

export const MOTION_DURATION = {
  direct: 90,
  enter: 140,
  exit: 120,
  state: 180,
  business: 210,
  reveal: 220,
  pulse: 820,
  reduce: 1,
  statusReset: 900,
} as const;

export const MOTION_EASING = {
  enter: Easing.Cubic.Out,
  exit: Easing.Quadratic.In,
  move: Easing.Quadratic.InOut,
  emphasis: Easing.Quadratic.Out,
  linear: Easing.Linear.None,
} as const;

export const MOTION_OPACITY = {
  hidden: 0,
  visible: 1,
  dim: 0.38,
} as const;

export const MOTION_TRANSLATE = {
  micro: 2,
  small: 6,
  medium: 8,
} as const;

export const MOTION_SCALE = {
  subtleIn: 0.98,
  emphasisIn: 0.96,
  press: 0.98,
} as const;
