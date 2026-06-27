# Component Harness

This folder is for very small, focused regression coverage around isolated UI
component harness pages.

Current intent:

- keep the harness simple and manual-first;
- cover only the higher-risk layout and placement contracts that are easy to
  regress;
- avoid building a broad Storybook-like system.

For `ComposerSelect`, the primary manual harness lives behind the Chrome query:

```text
/?harness=composer-select
```

Use it to inspect:

- three-in-a-row shrink behavior;
- long value truncation;
- open menu stability;
- edge-aware menu placement near container boundaries.
