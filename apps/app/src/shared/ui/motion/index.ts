export { MotionController, getSharedMotionController } from './motion-controller';
export { createDomMotionClock, createManualMotionClock } from './motion-clock';
export { readMotionDebugSnapshot } from './motion-debug';
export { MotionPresence } from './motion-presence';
export { MotionRuntime, getSharedMotionRuntime, StaticMotionHandle } from './motion-runtime';
export { shouldReduceMotion, resolveMotionPreference } from './motion-preference';
export { applyMotionTransform, validateMotionTransform } from './motion-transform-guard';
export { MOTION_DURATION, MOTION_EASING, MOTION_OPACITY, MOTION_SCALE, MOTION_TRANSLATE } from './motion-tokens';
export type {
  MotionChannel,
  MotionClock,
  MotionDebugSnapshot,
  MotionHandle,
  MotionPreference,
  MotionRecipe,
  MotionRuntimeLike,
  MotionTweenInput,
} from './motion-types';

export { activityPulseRecipe } from './recipes/activity-pulse';
export { attachmentPresenceRecipe } from './recipes/attachment-presence';
export { buttonStateRecipe } from './recipes/button-state';
export { contentCrossfadeRecipe } from './recipes/content-crossfade';
export { fadeRecipe } from './recipes/fade';
export { floatingControlPresenceRecipe } from './recipes/floating-control-presence';
export { iconCrossfadeRecipe } from './recipes/icon-crossfade';
export { imageRevealRecipe } from './recipes/image-reveal';
export { pageCrossfadeRecipe } from './recipes/page-crossfade';
export { popoverPresenceRecipe } from './recipes/popover-presence';
export { rotateLoopRecipe } from './recipes/rotate-loop';
export { scalePopRecipe } from './recipes/scale-pop';
export { slideFadeRecipe } from './recipes/slide-fade';
export { surfaceHighlightRecipe } from './recipes/surface-highlight';
export { toastPresenceRecipe } from './recipes/toast-presence';

export { useMotionController } from './react/use-motion-controller';
export { useMotionPreference } from './react/use-motion-preference';
export { useMotionPresence } from './react/use-motion-presence';
export type { UseMotionPresenceRecipe } from './react/use-motion-presence';
