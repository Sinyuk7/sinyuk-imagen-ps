import { act } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { UiCatalogHarnessPage } from '../../../src/harness/components/ui-catalog';

let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; });

describe('ui catalog harness', () => {
  it('stays inside public UI and has no external side effect dependency', () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, '../../../src/harness/components/ui-catalog/ui-catalog-harness.tsx'), 'utf8');
    expect(source).toContain("from '../../../shared/ui/ui-system'");
    expect(source).not.toMatch(/\b(?:fetch|localStorage|sessionStorage|Provider|ComfyUI|photoshop)\b/);
  });

  it('renders stable public catalog with one primary scroll owner', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<UiCatalogHarnessPage />));
    expect(container.querySelector('[data-visual-ready="true"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-primary-scroll="true"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="ui-catalog-scroll"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(3);
  });
});
