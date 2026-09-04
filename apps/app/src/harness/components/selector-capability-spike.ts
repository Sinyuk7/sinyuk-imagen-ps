/** selector 迁移隔离探针结果；失败时生产 renderer 保持 custom fallback。 */
export const SELECTOR_CAPABILITY_SPIKE = {
  controls: [
    { tag: 'sp-menu', status: 'blocked', reason: 'runtime registry and host first-frame geometry not proven' },
    { tag: 'sp-menu-item', status: 'blocked', reason: 'keyboard selection and focus return not proven' },
    { tag: 'sp-popover', status: 'blocked', reason: 'portal placement and native editor hit-test not proven' },
  ],
  productionRenderer: 'custom-selector',
  forbiddenMigration: ['sp-picker', 'photoshop-version-css-fork'],
} as const;
