import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ModelConfigurationPage } from '../../../../src/shared/ui/pages/model-configuration-page';
import { TestAppProviders } from '../../../helpers/render-helpers';
import { createFakeServices } from '../../../helpers/fakes';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
}

describe('ModelConfigurationPage', () => {
  it('shows one shared output capabilities section when operations are equal', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services} locale="en">
          <div className="panel">
            <ModelConfigurationPage onNav={() => undefined} />
          </div>
        </TestAppProviders>,
      );
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="model-configuration-add-button"]')?.click();
    });
    await flush();
    await flush();

    expect(container.textContent).toContain('Output capabilities');
    expect(container.textContent).toContain('Text + Edit');
    expect(container.textContent).not.toContain('Text to Image3 formats');
  });

  it('shows separate text and edit sections when preset operations differ', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services} locale="en">
          <div className="panel">
            <ModelConfigurationPage onNav={() => undefined} />
          </div>
        </TestAppProviders>,
      );
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="model-configuration-add-button"]')?.click();
    });
    await flush();
    await flush();

    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="model-config-preset-selector"]')?.click();
    });
    await flush();
    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="model-config-preset-selector-option-gpt-image-2-split"]')?.click();
    });
    await flush();
    await flush();

    expect(container.textContent).toContain('Text to Image');
    expect(container.textContent).toContain('Edit Image');
  });

  it('filters all matching sparse cells when one ratio is deselected', async () => {
    const { services, spies } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services} locale="en">
          <div className="panel">
            <ModelConfigurationPage onNav={() => undefined} />
          </div>
        </TestAppProviders>,
      );
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="model-configuration-add-button"]')?.click();
    });
    await flush();
    await flush();

    await act(async () => {
      changeInput(container.querySelector<HTMLInputElement>('[data-testid="model-config-model-id"]')!, 'filtered-model');
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="model-config-shared-ratio-16:9"]')?.click();
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="model-config-save-button"]')?.click();
    });
    await flush();
    await flush();

    expect(spies.saveUserModelConfig).toHaveBeenCalled();
    const input = spies.saveUserModelConfig.mock.calls.at(-1)?.[0];
    expect(input.outputMatrix[0].cells.some((cell: { ratio: string }) => cell.ratio === '16:9')).toBe(false);
    expect(input.outputMatrix[1].cells.some((cell: { ratio: string }) => cell.ratio === '16:9')).toBe(false);
  });

  it('shows a normalization warning for legacy hole subsets', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services} locale="en">
          <div className="panel">
            <ModelConfigurationPage
              onNav={() => undefined}
              initialEditorState={{ apiFormat: 'openai-images', modelId: 'gpt-image-2' }}
            />
          </div>
        </TestAppProviders>,
      );
    });
    await flush();
    await flush();

    expect(container.textContent).toContain('Saving will normalize it to shared format, ratio, and resolution rules.');
  });
});
