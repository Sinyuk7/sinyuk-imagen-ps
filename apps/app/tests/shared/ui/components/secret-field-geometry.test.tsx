import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SecretField } from '../../../../src/shared/ui/components/secret-field';
import { TestI18nProvider } from '../../../helpers/render-helpers';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = undefined;
  document.body.innerHTML = '';
});

describe('SecretField geometry', () => {
  it('keeps one outer affordance around one Spectrum textfield surface', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root?.render(
      <TestI18nProvider>
        <SecretField
          label="API key"
          inputId="secret-field-geometry"
          testIdPrefix="secret-field-geometry"
          value="secret"
          placeholder="sk-..."
          showValue={false}
          onValue={vi.fn()}
          onShowValueChange={vi.fn()}
          onClear={vi.fn()}
          clearAriaLabel="Clear"
          clearTooltip="Clear"
        />
      </TestI18nProvider>,
    ));

    expect(container.querySelectorAll('.field-input-affordance')).toHaveLength(1);
    expect(container.querySelectorAll('[data-uxp-textinput-spectrum="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('.field-input-action-host')).toHaveLength(2);
  });
});
