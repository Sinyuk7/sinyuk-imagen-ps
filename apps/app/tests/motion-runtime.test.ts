import { describe, expect, it } from 'vitest';
import {
  MotionController,
  MotionPresence,
  MotionRuntime,
  createManualMotionClock,
  fadeRecipe,
  shouldReduceMotion,
  validateMotionTransform,
} from '../src/shared/ui/motion';

describe('motion runtime', () => {
  it('drives tween.js with a manual clock and stops when complete', () => {
    const clock = createManualMotionClock(0);
    const runtime = new MotionRuntime(clock);
    const controller = new MotionController(runtime);
    const element = document.createElement('div');

    controller.play(fadeRecipe(element, { from: 0, to: 1, durationMs: 100 }));
    expect(runtime.activeCount()).toBe(1);
    expect(element.style.opacity).toBe('0');

    clock.tick(50);
    runtime.update(clock.now());
    expect(Number(element.style.opacity)).toBeGreaterThan(0);
    expect(Number(element.style.opacity)).toBeLessThan(1);

    clock.tick(50);
    runtime.update(clock.now());
    expect(element.style.opacity).toBe('1');
    expect(runtime.activeCount()).toBe(0);

    runtime.dispose();
  });

  it('rejects rotate, matrix, skew, and 3d transform strings', () => {
    expect(validateMotionTransform('translateY(4px) scale(0.98)')).toBe(true);
    expect(validateMotionTransform('translateX(-2px) scaleX(1) scaleY(1)')).toBe(true);
    expect(validateMotionTransform('rotate(90deg)')).toBe(false);
    expect(validateMotionTransform('matrix(1, 0, 0, 1, 0, 0)')).toBe(false);
    expect(validateMotionTransform('skewX(4deg)')).toBe(false);
    expect(validateMotionTransform('translate3d(0, 0, 0)')).toBe(false);
  });

  it('models presence without delaying business visibility state', () => {
    const presence = new MotionPresence(false);
    expect(presence.state).toBe('unmounted');

    expect(presence.setVisible(true)).toBe('entering');
    presence.entered();
    expect(presence.state).toBe('entered');

    expect(presence.setVisible(false)).toBe('exiting');
    presence.unmounted();
    expect(presence.state).toBe('unmounted');
  });

  it('finishes static reduced-motion recipes without scheduling a tween', () => {
    const clock = createManualMotionClock(0);
    const runtime = new MotionRuntime(clock);
    const controller = new MotionController(runtime);
    const element = document.createElement('div');

    controller.play(fadeRecipe(element, { from: 0, to: 1, preference: 'reduce' }));

    expect(element.style.opacity).toBe('1');
    expect(runtime.activeCount()).toBe(0);
    expect(shouldReduceMotion('reduce')).toBe(true);

    runtime.dispose();
  });

  it('cleans up active tweens on runtime dispose', () => {
    const clock = createManualMotionClock(0);
    const runtime = new MotionRuntime(clock);
    const controller = new MotionController(runtime);
    const element = document.createElement('div');

    controller.play(fadeRecipe(element, { from: 0, to: 1, durationMs: 1000 }));
    expect(runtime.activeCount()).toBe(1);

    runtime.dispose();

    expect(runtime.activeCount()).toBe(0);
    expect(runtime.debugSnapshot().activeTweenCount).toBe(0);
  });
});
