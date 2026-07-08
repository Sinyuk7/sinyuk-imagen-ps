import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  INLINE_STYLE_RULES,
  PROJECT_POLICY_CSS_RULES,
  UXP_UNSUPPORTED_CSS_RULES,
} from '../../../../scripts/policy/uxp-css-contract.mjs';

const APP_ROOT = process.cwd();
const UI_ROOT = join(APP_ROOT, 'src', 'shared', 'ui');
const STYLES_ROOT = join(UI_ROOT, 'styles');
const HARNESS_ROOT = join(APP_ROOT, 'src', 'harness');
const STYLE_FILE_EXTENSIONS = new Set(['.ts', '.tsx']);

/** 设计 token 三层模型拆分后，CSS 字面量分散在 styles/*.ts 中。 */
function listStyleSources(): readonly string[] {
  return readdirSync(STYLES_ROOT)
    .filter((entry) => entry.endsWith('.ts'))
    .map((entry) => join(STYLES_ROOT, entry));
}

const CSS_SOURCES = listStyleSources();

interface ForbiddenPattern {
  readonly name: string;
  readonly pattern: RegExp;
  readonly replacement: string;
  /** 'uxp-unsupported' = Adobe UXP 官方不支持；'project-policy' = 项目主动禁用以避免跨端/wrapper 问题 */
  readonly category: 'uxp-unsupported' | 'project-policy';
}

function mapForbiddenPatterns(
  rules: readonly { readonly name: string; readonly pattern: RegExp; readonly message: string }[],
  category: ForbiddenPattern['category'],
): readonly ForbiddenPattern[] {
  return rules.map((rule) => ({
    name: rule.name,
    pattern: rule.pattern,
    replacement: rule.message,
    category,
  }));
}

const UXP_UNSUPPORTED_PATTERNS = mapForbiddenPatterns(UXP_UNSUPPORTED_CSS_RULES, 'uxp-unsupported');
const PROJECT_POLICY_PATTERNS = mapForbiddenPatterns(PROJECT_POLICY_CSS_RULES, 'project-policy');
const INLINE_STYLE_FORBIDDEN = mapForbiddenPatterns(INLINE_STYLE_RULES, 'project-policy');
const LEGACY_PROJECT_POLICY_PATTERNS: readonly ForbiddenPattern[] = [
  {
    name: 'CSS shadow/filter effects',
    pattern: /(?:^|[;{\n])\s*(?:box-shadow|filter|backdrop-filter)\s*:/u,
    replacement: 'Use borders and flat colors instead of host-renderer effect paths (project policy: shadow rendering is inconsistent across UXP host versions).',
    category: 'project-policy',
  },
  {
    name: 'font shorthand',
    pattern: /(?:^|[;{\n])\s*font\s*:/u,
    replacement: 'Set font-family, font-size, font-weight, and line-height individually (project policy: font shorthand is unreliable in UXP host renderer).',
    category: 'project-policy',
  },
  {
    name: 'margin shorthand',
    pattern: /(?:^|[;{\n])\s*margin\s*:/u,
    replacement: 'Set margin-top, margin-right, margin-bottom, and margin-left individually (project policy: margin shorthand is unreliable in UXP host renderer).',
    category: 'project-policy',
  },
  {
    name: 'adjacent sibling spacing',
    pattern: />\s*\*\s*\+\s*\*/u,
    replacement: 'Use explicit class-level margins; Photoshop UXP did not apply this spacing reliably in host smoke (project policy based on host smoke evidence).',
    category: 'project-policy',
  },
];

const FORM_CONTROL_FILE = join(UI_ROOT, 'components', 'uxp-form-controls.tsx');
const NATIVE_CONTROL_FILE = join(UI_ROOT, 'primitives', 'native-controls.tsx');
const INPUT_PAGE_FORBIDDEN: readonly ForbiddenPattern[] = [
  {
    name: 'direct native input in page code',
    pattern: /<\s*input\b/u,
    replacement: 'Use shared native TextField/Checkbox primitives so Chrome and UXP stay on one control contract.',
    category: 'project-policy',
  },
  {
    name: 'direct native textarea in page code',
    pattern: /<\s*textarea\b/u,
    replacement: 'Use UxpTextArea so input synchronization stays in the UXP-safe control seam.',
    category: 'project-policy',
  },
  {
    name: 'page-level native change handler',
    pattern: /\bonChange\s*=/u,
    replacement: 'Use shared native primitives or UxpTextArea instead of direct input/change handlers in pages.',
    category: 'project-policy',
  },
  {
    name: 'page-level native input handler',
    pattern: /\bonInput\s*=/u,
    replacement: 'Use shared native primitives or UxpTextArea instead of direct input/change handlers in pages.',
    category: 'project-policy',
  },
];

const SYNTHETIC_INPUT_TEST_FORBIDDEN: readonly ForbiddenPattern[] = [
  {
    name: 'synthetic input event dispatch',
    pattern: /dispatchEvent\(\s*new\s+Event\(\s*['"]input['"]/u,
    replacement: 'Use keyboard/click/blur paths in repo harness; CDT input/change dispatch is a known host-crash risk.',
    category: 'project-policy',
  },
  {
    name: 'synthetic change event dispatch',
    pattern: /dispatchEvent\(\s*new\s+Event\(\s*['"]change['"]/u,
    replacement: 'Use keyboard/click/blur paths in repo harness; CDT input/change dispatch is a known host-crash risk.',
    category: 'project-policy',
  },
];

function walkFiles(root: string): readonly string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return walkFiles(path);
    }
    return [path];
  });
}

function linesWithPattern(filePath: string, pattern: RegExp): readonly string[] {
  const source = readFileSync(filePath, 'utf8');
  return source
    .split('\n')
    .flatMap((line, index) => (pattern.test(line) ? [`${relative(APP_ROOT, filePath)}:${index + 1}: ${line.trim()}`] : []));
}

function expectNoPattern(filePath: string, forbidden: ForbiddenPattern): void {
  const matches = linesWithPattern(filePath, forbidden.pattern);
  const categoryLabel = forbidden.category === 'uxp-unsupported'
    ? 'UXP platform unsupported'
    : 'project safety policy';
  expect(matches, `[${categoryLabel}] ${forbidden.name} is not allowed. ${forbidden.replacement}\n${matches.join('\n')}`).toEqual([]);
}

describe('UXP panel CSS contract', () => {
  it('keeps the shared panel stylesheet free of UXP-unsupported properties', () => {
    for (const source of CSS_SOURCES) {
      for (const forbidden of UXP_UNSUPPORTED_PATTERNS) {
        expectNoPattern(source, forbidden);
      }
    }
  });

  it('keeps the shared panel stylesheet free of project-policy-denied patterns', () => {
    for (const source of CSS_SOURCES) {
      for (const forbidden of PROJECT_POLICY_PATTERNS) {
        expectNoPattern(source, forbidden);
      }
      for (const forbidden of LEGACY_PROJECT_POLICY_PATTERNS) {
        expectNoPattern(source, forbidden);
      }
    }
  });

  it('covers the Composer bottom-row class contract used by MainPage', () => {
    const unionSource = CSS_SOURCES.map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(unionSource).toContain('.cmp-bottom{');
    expect(unionSource).toContain('.cmp-action-left');
    expect(unionSource).toContain('.cmp-action-right');
    expect(unionSource).toContain('.cmp-opt-icon-button{');
    expect(unionSource).toContain('.cmp-chip-overlay-value-icon{');
    expect(unionSource).toContain('.cmp-chip-a11y-value-icon{');
    expect(unionSource).toContain('.cmp-chip-value-text{');
    expect(unionSource).toContain('.cmp-chip-host > .ui-overlay-icon-button,');
    expect(unionSource).toContain('.cmp-chip-host > .ui-overlay-icon-layer{');
    expect(unionSource).toContain('.cmp-chip-overlay-inner-icon,');
    expect(unionSource).toContain('.cmp-chip-overlay-inner-text{');
    expect(unionSource).toContain('.att-thumb > .motion-highlight{');
    expect(unionSource).toContain('bottom:0;');
    expect(unionSource).toContain('border-radius:inherit;');
  });

  it('keeps toasts below the app header and fluid in compact panels', () => {
    const unionSource = CSS_SOURCES.map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(unionSource).toContain('--app-header-height:48px');
    expect(unionSource).toContain('.ui-toast[data-testid="toast"]');
    expect(unionSource).toContain('top:calc(var(--app-header-height, 48px) + 10px)');
    expect(unionSource).toContain('right:12px; left:auto;');
    expect(unionSource).toContain('width:var(--toast-max-width); min-width:220px; max-width:calc(100% - 24px);');
    expect(unionSource).toContain('min-height:var(--toast-min-height);');
    expect(unionSource).toContain('.panel[data-panel-width-mode="compact"] .ui-toast[data-testid="toast"]');
    expect(unionSource).toContain('left:12px; right:12px; width:auto; min-width:0; max-width:none;');
    expect(unionSource).not.toContain('.ui-toast-shell{ position:absolute;');
    expect(unionSource).not.toContain('justify-content:flex-end; pointer-events:none;');
  });

  it('keeps conversation rounds visually separated without card restructuring', () => {
    const unionSource = CSS_SOURCES.map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(unionSource).toContain('.round-item{');
    expect(unionSource).toContain('border-bottom:1px solid var(--app-color-border-default);');
    expect(unionSource).toContain('.round-item:last-child{ margin-bottom:0; border-bottom:none; }');
  });

  it('keeps chat history tokens centered on regular 360/420 panels and only relaxes them in wide mode', () => {
    const unionSource = CSS_SOURCES.map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(unionSource).toContain('--image-fallback-icon-color:var(--app-color-text-muted);');
    expect(unionSource).toContain('--image-fallback-title-color:var(--app-color-text-secondary);');
    expect(unionSource).toContain('--image-fallback-detail-color:var(--app-color-text-muted);');
    expect(unionSource).toContain('--image-fallback-gap:8px;');
    expect(unionSource).toContain('--chat-prompt-inline-max:272px;');
    expect(unionSource).toContain('--chat-result-inline-max:320px;');
    expect(unionSource).toContain('--chat-preview-inline-max:288px;');
    expect(unionSource).toContain('--chat-preview-block-fallback:232px;');
    expect(unionSource).toContain('--chat-preview-portrait-cap-padding:150%;');
    expect(unionSource).toContain('--chat-preview-stage-surface:var(--app-color-background-base);');
    expect(unionSource).toContain('--chat-preview-alpha-surface:var(--app-color-background-layer-2);');
    expect(unionSource).toContain('width:100%; max-width:var(--chat-result-inline-max);');
    expect(unionSource).toContain('align-self:flex-start;');
    expect(unionSource).toContain('width:auto;');
    expect(unionSource).toContain('max-width:100%;');
    expect(unionSource).toContain('max-width:none;');
    expect(unionSource).toContain('margin-right:0;');
    expect(unionSource).toContain('margin-left:0;');
    expect(unionSource).toContain('.panel[data-panel-width-mode="compact"] .round-list{');
    expect(unionSource).toContain('--chat-result-inline-max:100%;');
    expect(unionSource).toContain('.panel[data-panel-width-mode="regular"] .round-list{');
    expect(unionSource).toContain('.panel[data-panel-width-mode="wide"] .round-list{');
    expect(unionSource).toContain('--chat-result-inline-max:440px;');
    expect(unionSource).toContain('min-height:0;');
    expect(unionSource).toContain('.img-stage{');
    expect(unionSource).toContain('.img-frame{');
    expect(unionSource).toContain('.image-fallback{');
    expect(unionSource).toContain('.image-fallback-title{');
    expect(unionSource).toContain('.img-media{');
    expect(unionSource).toContain('.img-result[data-preview-layout="tall-contain"][data-preview-visual-mode="contained-well"][data-has-preview="true"] .img-stage::before{');
    expect(unionSource).toContain('.img-frame[data-alpha-state="transparent"]{');
    expect(unionSource).not.toContain('background-image:linear-gradient(45deg');
    expect(unionSource).not.toContain('.img-media-shell[data-alpha-backdrop="true"]{');
    expect(unionSource).not.toContain('.panel[data-panel-width-mode="wide"] .img-result{ height:300px; max-height:440px; }');
  });

  it('keeps React inline styles from bypassing the UXP-safe spacing rules', () => {
    const uiFiles = [...walkFiles(UI_ROOT), ...walkFiles(HARNESS_ROOT)].filter((filePath) => {
      const extension = filePath.slice(filePath.lastIndexOf('.'));
      return STYLE_FILE_EXTENSIONS.has(extension) && !filePath.startsWith(STYLES_ROOT);
    });

    for (const filePath of uiFiles) {
      for (const forbidden of INLINE_STYLE_FORBIDDEN) {
        expectNoPattern(filePath, forbidden);
      }
    }
  });

  it('keeps CSS transform inside the motion layer only', () => {
    const motionRoot = join(UI_ROOT, 'motion');
    const uiFiles = walkFiles(UI_ROOT).filter((filePath) => {
      const extension = filePath.slice(filePath.lastIndexOf('.'));
      return STYLE_FILE_EXTENSIONS.has(extension) && !filePath.startsWith(motionRoot);
    });

    for (const filePath of uiFiles) {
      expectNoPattern(filePath, {
        name: 'CSS transform outside motion layer',
        pattern: /\btransform\s*:/u,
        replacement: 'Use the shared motion layer and apply transform via JS DOM style.transform; do not write `transform:` in styles or inline style objects.',
        category: 'project-policy',
      });
    }
  });

  it('keeps native form events behind the UXP-safe control seam', () => {
    const uiFiles = walkFiles(UI_ROOT).filter((filePath) => {
      const extension = filePath.slice(filePath.lastIndexOf('.'));
      return STYLE_FILE_EXTENSIONS.has(extension) && filePath !== FORM_CONTROL_FILE && filePath !== NATIVE_CONTROL_FILE;
    });

    for (const filePath of uiFiles) {
      for (const forbidden of INPUT_PAGE_FORBIDDEN) {
        expectNoPattern(filePath, forbidden);
      }
    }
  });

  it('does not use synthetic input/change dispatch as app harness input', () => {
    const harnessFiles = [...walkFiles(join(APP_ROOT, 'tests')), ...walkFiles(join(APP_ROOT, 'src'))].filter(
      (filePath) => /\.(?:test|spec)\.(?:ts|tsx)$/u.test(filePath) && !filePath.endsWith('tests/native-controls.test.tsx'),
    );

    for (const filePath of harnessFiles) {
      for (const forbidden of SYNTHETIC_INPUT_TEST_FORBIDDEN) {
        expectNoPattern(filePath, forbidden);
      }
    }
  });
});
