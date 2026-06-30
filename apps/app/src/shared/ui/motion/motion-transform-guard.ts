const FORBIDDEN_TRANSFORM_PATTERN = /\b(?:rotate(?:X|Y|Z|3d)?|skew(?:X|Y)?|matrix(?:3d)?|perspective|translateZ|scaleZ|translate3d|scale3d)\s*\(/u;
const TRANSFORM_TOKEN_PATTERN = /^(?:translateX|translateY|scale|scaleX|scaleY)\(-?(?:\d+|\d*\.\d+)(?:px)?\)$/u;

declare const __IMAGEN_PS_DEV__: boolean;

export function validateMotionTransform(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'none') {
    return true;
  }
  if (FORBIDDEN_TRANSFORM_PATTERN.test(trimmed)) {
    return false;
  }
  return trimmed.split(/\s+(?=[a-zA-Z]+\()/u).every((token) => TRANSFORM_TOKEN_PATTERN.test(token));
}

export function applyMotionTransform(target: HTMLElement | SVGElement, value: string): boolean {
  if (!validateMotionTransform(value)) {
    if (__IMAGEN_PS_DEV__) {
      throw new Error(`Forbidden motion transform: ${value}`);
    }
    if (target instanceof HTMLElement) {
      target.style.transform = 'none';
    }
    return false;
  }
  if (target instanceof HTMLElement) {
    target.style.transform = value;
  } else {
    target.setAttribute('transform', value);
  }
  return true;
}

export function motionTranslateY(px: number): string {
  return `translateY(${px}px)`;
}

export function motionTranslateX(px: number): string {
  return `translateX(${px}px)`;
}

export function motionScale(value: number): string {
  return `scale(${value})`;
}
