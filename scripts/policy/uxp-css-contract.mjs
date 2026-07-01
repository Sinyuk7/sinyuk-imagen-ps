export const uxpCssSourceExtensions = new Set(['.ts', '.tsx']);

export const uxpCssRoots = [
  'apps/app/src/shared/ui',
  'apps/app/src/harness',
];

/**
 * UXP platform unsupported：Adobe UXP CSS reference 明确未列入支持合同，
 * 或明确仅支持更小的值集合。
 */
export const UXP_UNSUPPORTED_CSS_RULES = [
  {
    name: '禁止 CSS animation',
    pattern: /(?:^|[;{\n])\s*animation(?:-[a-z-]+)?\s*:/u,
    message: 'Adobe UXP CSS reference does not support animation properties.',
  },
  {
    name: '禁止 CSS keyframes',
    pattern: /@keyframes\b/u,
    message: 'Adobe UXP CSS reference does not support keyframes.',
  },
  {
    name: '禁止 CSS transition',
    pattern: /(?:^|[;{\n])\s*transition(?:-[a-z-]+)?\s*:/u,
    message: 'Adobe UXP CSS reference does not support transition properties.',
  },
  {
    name: '禁止 CSS grid layout',
    pattern: /(?:^|[;{\n])\s*display\s*:\s*grid\b/u,
    message: 'Adobe UXP documents flex display values but not grid.',
  },
  {
    name: '禁止 place-items',
    pattern: /(?:^|[;{\n])\s*place-items\s*:/u,
    message: 'Use align-items and justify-content on flex containers.',
  },
  {
    name: '禁止 place-content',
    pattern: /(?:^|[;{\n])\s*place-content\s*:/u,
    message: 'Use align-content and justify-content explicitly.',
  },
  {
    name: '禁止 place-self',
    pattern: /(?:^|[;{\n])\s*place-self\s*:/u,
    message: 'Use align-self explicitly.',
  },
  {
    name: '禁止 justify-items',
    pattern: /(?:^|[;{\n])\s*justify-items\s*:/u,
    message: 'Adobe UXP flex contract does not include justify-items.',
  },
  {
    name: '禁止 justify-self',
    pattern: /(?:^|[;{\n])\s*justify-self\s*:/u,
    message: 'Adobe UXP flex contract does not include justify-self.',
  },
  {
    name: '禁止 flex-flow',
    pattern: /(?:^|[;{\n])\s*flex-flow\s*:/u,
    message: 'Keep flex-direction and flex-wrap explicit in UXP-safe styles.',
  },
  {
    name: '禁止 order',
    pattern: /(?:^|[;{\n])\s*order\s*:/u,
    message: 'Keep DOM order aligned with visual order.',
  },
  {
    name: '禁止 flex-wrap: wrap-reverse',
    pattern: /(?:^|[;{\n])\s*flex-wrap\s*:\s*wrap-reverse\b/u,
    message: 'Adobe UXP only documents nowrap and wrap.',
  },
  {
    name: '禁止 justify-content: space-evenly',
    pattern: /(?:^|[;{\n])\s*justify-content\s*:\s*space-evenly\b/u,
    message: 'Adobe UXP only documents flex-start, flex-end, center, space-between, space-around, and stretch.',
  },
  {
    name: '禁止 align-items: baseline',
    pattern: /(?:^|[;{\n])\s*align-items\s*:\s*(?:baseline|first\s+baseline|last\s+baseline)\b/u,
    message: 'Adobe UXP only documents flex-start, flex-end, center, and stretch.',
  },
  {
    name: '禁止 align-self: baseline',
    pattern: /(?:^|[;{\n])\s*align-self\s*:\s*(?:baseline|first\s+baseline|last\s+baseline)\b/u,
    message: 'Adobe UXP align-self contract should stay within flex-start, flex-end, center, and stretch.',
  },
  {
    name: '禁止 justify/align start-end safe/unsafe 扩展值',
    pattern: /(?:^|[;{\n])\s*(?:justify-content|align-items|align-self|align-content)\s*:\s*(?:start|end|safe\s+center|unsafe\s+center)\b/u,
    message: 'Stay within Adobe-documented flex alignment values only.',
  },
];

/**
 * Project policy：当前仓库为了 Chrome/UXP 共享 UI 的稳定性主动收紧的规则。
 */
export const PROJECT_POLICY_CSS_RULES = [
  {
    name: '禁止 gap / row-gap / column-gap',
    pattern: /(?:^|[;{\n])\s*(?!--)(?:gap|row-gap|column-gap)\s*:/u,
    message: 'Use explicit margins instead of gap in shared UI and harness CSS.',
  },
];

export const INLINE_STYLE_RULES = [
  {
    name: '禁止 inline transition',
    pattern: /\btransition\s*:/u,
    message: 'Keep Photoshop UXP visual state immediate and static.',
  },
  {
    name: '禁止 inline animation',
    pattern: /\banimation\s*:/u,
    message: 'Keep Photoshop UXP visual state immediate and static.',
  },
  {
    name: '禁止 inline shadow/filter effects',
    pattern: /\b(?:boxShadow|filter|backdropFilter)\s*:/u,
    message: 'Use borders and flat colors instead of host-renderer effects.',
  },
  {
    name: '禁止 inline gap',
    pattern: /(?:^|[^-\w])gap\s*:/u,
    message: 'Move spacing into a class that uses explicit UXP-safe margins.',
  },
  {
    name: '禁止 inline grid display',
    pattern: /display\s*:\s*['"]grid['"]/u,
    message: 'Use inline flex centering or a shared CSS class.',
  },
  {
    name: '禁止 inline placeItems',
    pattern: /\bplaceItems\s*:/u,
    message: 'Use alignItems and justifyContent on flex containers.',
  },
  {
    name: '禁止 inline space-evenly',
    pattern: /\bjustifyContent\s*:\s*['"]space-evenly['"]/u,
    message: 'Stay within Adobe-documented justify-content values.',
  },
  {
    name: '禁止 inline baseline alignment',
    pattern: /\balignItems\s*:\s*['"]baseline['"]/u,
    message: 'Stay within Adobe-documented align-items values.',
  },
];
