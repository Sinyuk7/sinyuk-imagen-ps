import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = process.cwd();
const UI_ROOT = join(APP_ROOT, 'src', 'shared', 'ui');
const CSS_SOURCE = join(UI_ROOT, 'panel-css.ts');
const STYLE_FILE_EXTENSIONS = new Set(['.ts', '.tsx']);

interface ForbiddenPattern {
  readonly name: string;
  readonly pattern: RegExp;
  readonly replacement: string;
}

const PANEL_CSS_FORBIDDEN: readonly ForbiddenPattern[] = [
  {
    name: 'CSS animation',
    pattern: /(?:^|[;{\n])\s*animation(?:-[a-z-]+)?\s*:/u,
    replacement: 'Use static state changes; repeated Photoshop UXP host drawing is sensitive to animation paths.',
  },
  {
    name: 'CSS keyframes',
    pattern: /@keyframes\b/u,
    replacement: 'Use static state changes; do not define host-side keyframe animations.',
  },
  {
    name: 'CSS transition',
    pattern: /(?:^|[;{\n])\s*transition(?:-[a-z-]+)?\s*:/u,
    replacement: 'Use immediate visual states; avoid transition work in the UXP host renderer.',
  },
  {
    name: 'CSS transform',
    pattern: /(?:^|[;{\n])\s*(?<!-)transform\s*:/u,
    replacement: 'Use explicit positioning instead of host-renderer transforms.',
  },
  {
    name: 'CSS shadow/filter effects',
    pattern: /(?:^|[;{\n])\s*(?:box-shadow|filter|backdrop-filter)\s*:/u,
    replacement: 'Use borders and flat colors instead of host-renderer effect paths.',
  },
  {
    name: 'flex/grid gap',
    pattern: /(?:^|[;{\n])\s*(?:gap|row-gap|column-gap)\s*:/u,
    replacement: 'Use explicit class-level margins; sibling selector spacing is not reliable in Photoshop UXP.',
  },
  {
    name: 'CSS grid layout',
    pattern: /(?:^|[;{\n])\s*display\s*:\s*grid\b/u,
    replacement: 'Use flex layout; Adobe UXP documents flex display values but not grid.',
  },
  {
    name: 'grid place-items',
    pattern: /(?:^|[;{\n])\s*place-items\s*:/u,
    replacement: 'Use `align-items` and `justify-content` on flex containers.',
  },
  {
    name: 'font shorthand',
    pattern: /(?:^|[;{\n])\s*font\s*:/u,
    replacement: 'Set font-family, font-size, font-weight, and line-height individually.',
  },
  {
    name: 'margin shorthand',
    pattern: /(?:^|[;{\n])\s*margin\s*:/u,
    replacement: 'Set margin-top, margin-right, margin-bottom, and margin-left individually.',
  },
  {
    name: 'adjacent sibling spacing',
    pattern: />\s*\*\s*\+\s*\*/u,
    replacement: 'Use explicit class-level margins; Photoshop UXP did not apply this spacing reliably in host smoke.',
  },
];

const INLINE_STYLE_FORBIDDEN: readonly ForbiddenPattern[] = [
  {
    name: 'inline transition',
    pattern: /\btransition\s*:/u,
    replacement: 'Keep Photoshop UXP visual state immediate and static.',
  },
  {
    name: 'inline animation',
    pattern: /\banimation\s*:/u,
    replacement: 'Keep Photoshop UXP visual state immediate and static.',
  },
  {
    name: 'inline transform',
    pattern: /\btransform\s*:/u,
    replacement: 'Use explicit positioning instead of transforms.',
  },
  {
    name: 'inline shadow/filter effects',
    pattern: /\b(?:boxShadow|filter|backdropFilter)\s*:/u,
    replacement: 'Use borders and flat colors instead of host-renderer effects.',
  },
  {
    name: 'inline style gap',
    pattern: /\bgap\s*:/u,
    replacement: 'Move spacing into a class that uses explicit UXP-safe margins.',
  },
  {
    name: 'inline grid display',
    pattern: /display\s*:\s*['"]grid['"]/u,
    replacement: 'Use inline flex centering or a shared CSS class.',
  },
  {
    name: 'inline placeItems',
    pattern: /\bplaceItems\s*:/u,
    replacement: 'Use `alignItems` and `justifyContent` on flex containers.',
  },
  {
    name: 'inline font shorthand',
    pattern: /\bfont\s*:/u,
    replacement: 'Use explicit font longhand properties.',
  },
  {
    name: 'inline margin shorthand',
    pattern: /\bmargin\s*:/u,
    replacement: 'Use explicit marginTop/marginRight/marginBottom/marginLeft values.',
  },
];

const FORM_CONTROL_FILE = join(UI_ROOT, 'components', 'uxp-form-controls.tsx');
const INPUT_PAGE_FORBIDDEN: readonly ForbiddenPattern[] = [
  {
    name: 'direct native input in page code',
    pattern: /<\s*input\b/u,
    replacement: 'Use shared Spectrum TextField/Checkbox primitives so Chrome and UXP stay on one control contract.',
  },
  {
    name: 'direct native textarea in page code',
    pattern: /<\s*textarea\b/u,
    replacement: 'Use UxpTextArea so input synchronization stays in the UXP-safe control seam.',
  },
  {
    name: 'page-level native change handler',
    pattern: /\bonChange\s*=/u,
    replacement: 'Use shared Spectrum primitives or UxpTextArea instead of direct input/change handlers in pages.',
  },
  {
    name: 'page-level native input handler',
    pattern: /\bonInput\s*=/u,
    replacement: 'Use shared Spectrum primitives or UxpTextArea instead of direct input/change handlers in pages.',
  },
];

const SYNTHETIC_INPUT_TEST_FORBIDDEN: readonly ForbiddenPattern[] = [
  {
    name: 'synthetic input event dispatch',
    pattern: /dispatchEvent\(\s*new\s+Event\(\s*['"]input['"]/u,
    replacement: 'Use keyboard/click/blur paths in repo harness; CDT input/change dispatch is a known host-crash risk.',
  },
  {
    name: 'synthetic change event dispatch',
    pattern: /dispatchEvent\(\s*new\s+Event\(\s*['"]change['"]/u,
    replacement: 'Use keyboard/click/blur paths in repo harness; CDT input/change dispatch is a known host-crash risk.',
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
  expect(matches, `${forbidden.name} is not UXP-safe. ${forbidden.replacement}\n${matches.join('\n')}`).toEqual([]);
}

describe('UXP panel CSS compatibility', () => {
  it('keeps the shared panel stylesheet on UXP-safe layout primitives', () => {
    for (const forbidden of PANEL_CSS_FORBIDDEN) {
      expectNoPattern(CSS_SOURCE, forbidden);
    }
  });

  it('keeps React inline styles from bypassing the UXP-safe spacing rules', () => {
    const uiFiles = walkFiles(UI_ROOT).filter((filePath) => {
      const extension = filePath.slice(filePath.lastIndexOf('.'));
      return STYLE_FILE_EXTENSIONS.has(extension) && filePath !== CSS_SOURCE;
    });

    for (const filePath of uiFiles) {
      for (const forbidden of INLINE_STYLE_FORBIDDEN) {
        expectNoPattern(filePath, forbidden);
      }
    }
  });

  it('keeps native form events behind the UXP-safe control seam', () => {
    const uiFiles = walkFiles(UI_ROOT).filter((filePath) => {
      const extension = filePath.slice(filePath.lastIndexOf('.'));
      return STYLE_FILE_EXTENSIONS.has(extension) && filePath !== FORM_CONTROL_FILE;
    });

    for (const filePath of uiFiles) {
      for (const forbidden of INPUT_PAGE_FORBIDDEN) {
        expectNoPattern(filePath, forbidden);
      }
    }
  });

  it('does not use synthetic input/change dispatch as app harness input', () => {
    const harnessFiles = [...walkFiles(join(APP_ROOT, 'tests')), ...walkFiles(join(APP_ROOT, 'src'))].filter(
      (filePath) => /\.(?:test|spec)\.(?:ts|tsx)$/u.test(filePath) && !filePath.endsWith('tests/spectrum-controls.test.tsx'),
    );

    for (const filePath of harnessFiles) {
      for (const forbidden of SYNTHETIC_INPUT_TEST_FORBIDDEN) {
        expectNoPattern(filePath, forbidden);
      }
    }
  });
});
