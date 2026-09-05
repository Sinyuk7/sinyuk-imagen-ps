import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { scanSharedControlInventory, checkSharedControlInventory } from '../../../../scripts/policy/shared-control-inventory.mjs';

const REPO_ROOT = resolve(process.cwd(), '..', '..');

describe('shared control inventory', () => {
  it('records owner, line, tag, and explicit fallback reason', () => {
    const inventory = scanSharedControlInventory(REPO_ROOT);
    expect(inventory.find((entry) => entry.owner === 'SegmentedTabs')).toMatchObject({ tag: 'button', reason: 'custom-fallback', allowed: true });
    expect(inventory.find((entry) => entry.owner === 'ComposerSelectMenu')).toBeUndefined();
  });

  it('has no unregistered raw controls in shared owners', () => {
    expect(checkSharedControlInventory(REPO_ROOT)).toEqual([]);
  });
});
