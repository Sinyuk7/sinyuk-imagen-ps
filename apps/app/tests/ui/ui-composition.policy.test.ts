import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkUiComposition,
  scanUiCompositionPages,
  scanUiCompositionSource,
} from '../../../../scripts/policy/ui-composition.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');

describe('UI composition policy', () => {
  it('accepts every current page with zero violations', () => {
    expect(scanUiCompositionPages(repoRoot)).toEqual([]);
    expect(checkUiComposition(repoRoot)).toEqual([]);
  });

  it('rejects a new page violation', () => {
    const violations = scanUiCompositionSource(
      'apps/app/src/shared/ui/pages/example-page.tsx',
      'export function ExamplePage() { return <button type="button">Add</button>; }',
    );
    expect(violations).toMatchObject([{ rule: 'raw-native-control' }]);
  });

  it('rejects every direct form control and Material token in page code', () => {
    for (const source of [
      '<input value="x" />',
      '<textarea value="x" />',
      '<select value="x" />',
      'const color = "var(--md-sys-color-primary)";',
    ]) {
      expect(scanUiCompositionSource('apps/app/src/shared/ui/pages/example-page.tsx', source)).not.toEqual([]);
    }
  });

  it('permits only --ui custom properties in a page style object', () => {
    const allowed = scanUiCompositionSource(
      'apps/app/src/shared/ui/pages/example-page.tsx',
      "export function ExamplePage() { return <div style={{ '--ui-depth': 1 } as React.CSSProperties} />; }",
    );
    const rejected = scanUiCompositionSource(
      'apps/app/src/shared/ui/pages/example-page.tsx',
      "export function ExamplePage() { return <div style={{ paddingLeft: 1 }} />; }",
    );
    expect(allowed).toEqual([]);
    expect(rejected).toMatchObject([{ rule: 'visual-inline-style' }]);
  });
});
