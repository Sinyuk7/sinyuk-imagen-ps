# UXP Motion System

## Current Fact

`apps/app` owns the shared UI motion system. Motion is driven by
`@tweenjs/tween.js` through `apps/app/src/shared/ui/motion/`:

- `MotionRuntime` owns one `Tween.Group` and one scheduler.
- `MotionController` exposes channel-based `play`, `stop`, `finish`, and
  `isRunning`.
- Presence, activity, fade, slide-fade, scale, content-crossfade,
  image-reveal, surface-highlight, and page-crossfade recipes live under
  `motion/recipes/`.
- React binding lives in `motion/react/` and UI wrappers live in
  `components/motion-ui.tsx`.

The system is opacity-first. Transform is allowed only through the motion layer
writing DOM `style.transform`; the transform guard accepts only `translateX`,
`translateY`, `scale`, `scaleX`, and `scaleY`. It rejects rotate, skew, matrix,
perspective, translate3d, and scale3d strings.

`apps/app/public/manifest.json` declares `featureFlags.CSSNextSupport: true`,
which is required before using UXP transform support. The bundle test verifies
that the source and dist manifests both keep the flag.

CSS transitions, CSS animations, keyframes, and CSS `transform:` remain banned
outside the motion layer. `apps/app/tests/uxp-css-compat.test.ts` is the
mechanical guard for that policy.

## Why Future Development Needs This

Motion changes must not move ownership into `packages/application`,
`packages/core-engine`, or `packages/providers`. Business state still changes
immediately; motion only reflects state after disabled state, focus handling,
menu state, and host calls have already been applied.

A single visual node should have one motion owner per CSS property. Put scale
motion on wrappers when the child control already owns its own DOM or layout
contract. Do not add CSS transitions, Web Animations API, keyframes, or rotate
effects to make a recipe easier.

Chrome, jsdom, and bundle tests do not prove Photoshop host behavior. Transform
and `requestAnimationFrame` behavior still need manual Photoshop / UXP smoke
before being treated as real-host evidence.

## How To Re-verify

Run:

```bash
pnpm --filter @imagen-ps/app test
pnpm --filter @imagen-ps/app build:uxp
pnpm --filter @imagen-ps/app build:chrome
pnpm check:policy
pnpm validate
```

For real-host proof, build UXP and load `apps/app/dist/manifest.json` through
UXP Developer Tool in Photoshop. Verify menus, toast, send/running/result,
Place, Capture, Optimize, History locate, compact panel, hidden/reshown panel,
and reduced-motion behavior manually.
