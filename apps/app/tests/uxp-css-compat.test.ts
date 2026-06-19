import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = process.cwd();
const UI_ROOT = join(APP_ROOT, 'src', 'ui');
const CSS_SOURCE = join(UI_ROOT, 'panel-css.ts');
const STYLE_FILE_EXTENSIONS = new Set(['.ts', '.tsx']);

interface ForbiddenPattern {
  readonly name: string;
  readonly pattern: RegExp;
  readonly replacement: string;
}

const PANEL_CSS_FORBIDDEN: readonly ForbiddenPattern[] = [
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
      return STYLE_FILE_EXTENSIONS.has(extension);
    });

    for (const filePath of uiFiles) {
      for (const forbidden of INLINE_STYLE_FORBIDDEN) {
        expectNoPattern(filePath, forbidden);
      }
    }
  });
});
