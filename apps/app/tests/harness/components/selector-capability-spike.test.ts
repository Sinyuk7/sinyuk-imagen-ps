import { describe, expect, it } from 'vitest';
import { SELECTOR_CAPABILITY_SPIKE } from '../../../src/harness/components/selector-capability-spike';

describe('selector capability spike', () => {
  it('keeps unproven menu and popover controls out of production', () => {
    expect(SELECTOR_CAPABILITY_SPIKE.productionRenderer).toBe('custom-selector');
    expect(SELECTOR_CAPABILITY_SPIKE.controls.every((control) => control.status === 'blocked')).toBe(true);
    expect(SELECTOR_CAPABILITY_SPIKE.forbiddenMigration).toContain('sp-picker');
  });
});
