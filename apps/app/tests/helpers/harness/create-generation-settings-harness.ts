import { act } from 'react';
import type { ImageOutputSelection } from '@imagen-ps/application';
import { renderMainPage, flush, sendPrompt } from '../main-page-harness';
import { createFakeServices } from './create-fake-services';

type FakeServices = ReturnType<typeof createFakeServices>;

function requireElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
  });
}

export interface GenerationSettingsHarness {
  readonly container: HTMLElement;
  readonly fake: FakeServices;
  openSettings(): Promise<void>;
  openGlobalSettings(): Promise<void>;
  backToMainFromGlobalSettings(): Promise<void>;
  selectModel(optionId: string): Promise<void>;
  selectMainSize(optionId: string): Promise<void>;
  selectMainRatio(optionId: string): Promise<void>;
  selectGlobalSize(optionId: string): Promise<void>;
  selectGlobalRatio(optionId: string): Promise<void>;
  selectGlobalFormat(optionId: string): Promise<void>;
  readMainSelection(): { readonly imageSize: string | null; readonly ratio: string | null };
  readGlobalSelection(): { readonly imageSize: string | null; readonly ratio: string | null; readonly outputFormat: string | null };
  send(prompt: string): Promise<void>;
  lastSavedPreference(): unknown;
  lastSubmittedSelection(): ImageOutputSelection | null;
}

export async function createGenerationSettingsHarness(
  container: HTMLElement,
  options?: Parameters<typeof createFakeServices>[0],
): Promise<GenerationSettingsHarness> {
  const fake = createFakeServices(options);
  await renderMainPage(container, fake);
  await flush();
  await flush();

  async function openSelect(testId: string): Promise<void> {
    await click(requireElement(container, `[data-testid="${testId}"]`));
    await flush();
  }

  async function waitUntilEnabled(testId: string): Promise<void> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const element = requireElement(container, `[data-testid="${testId}"]`);
      if (!element.hasAttribute('disabled')) {
        return;
      }
      await flush();
      await flush();
    }
    const element = requireElement(container, `[data-testid="${testId}"]`);
    throw new Error(`Selector stayed disabled: ${testId}; selected=${element.getAttribute('data-selected-id') ?? 'none'}`);
  }

  async function selectOption(testId: string, optionId: string): Promise<void> {
    await waitUntilEnabled(testId);
    await openSelect(testId);
    await flush();
    const selector = `[data-testid="${testId}-option-${optionId}"]`;
    const option = document.body.querySelector<HTMLElement>(selector);
    if (!option) {
      const available = Array.from(document.body.querySelectorAll<HTMLElement>(`[data-testid^="${testId}-option-"]`))
        .map((element) => element.getAttribute('data-testid'))
        .filter((value): value is string => Boolean(value));
      throw new Error(`Missing required element: ${selector}; available options: ${available.join(', ') || 'none'}`);
    }
    await click(option);
    await flush();
    await flush();
  }

  function selectedId(testId: string): string | null {
    return requireElement(container, `[data-testid="${testId}"]`).getAttribute('data-selected-id');
  }

  async function openSettings(): Promise<void> {
    await click(requireElement(container, '[data-testid="main-providers-button"]'));
    await flush();
    await flush();
  }

  async function openGlobalSettings(): Promise<void> {
    await openSettings();
    await click(requireElement(container, '[data-testid="global-generation-settings-row"]'));
    await flush();
    await flush();
  }

  async function backToMainFromGlobalSettings(): Promise<void> {
    await click(requireElement(container, '[data-testid="global-settings-back-button"]'));
    await flush();
    await flush();
    await click(requireElement(container, '[data-testid="providers-back-button"]'));
    await flush();
    await flush();
  }

  return {
    container,
    fake,
    openSettings,
    openGlobalSettings,
    backToMainFromGlobalSettings,
    selectModel: async (optionId: string) => {
      await selectOption('main-model-selector', optionId);
      await flush();
      await flush();
    },
    selectMainSize: async (optionId: string) => selectOption('composer-output-size-selector', optionId),
    selectMainRatio: async (optionId: string) => selectOption('composer-output-ratio-selector', optionId),
    selectGlobalSize: async (optionId: string) => selectOption('global-output-size-selector', optionId),
    selectGlobalRatio: async (optionId: string) => selectOption('global-aspect-ratio-selector', optionId),
    selectGlobalFormat: async (optionId: string) => selectOption('global-output-format-selector', optionId),
    readMainSelection(): { readonly imageSize: string | null; readonly ratio: string | null } {
      return {
        imageSize: selectedId('composer-output-size-selector'),
        ratio: container.querySelector('[data-testid="composer-output-ratio-selector"]')
          ? selectedId('composer-output-ratio-selector')
          : null,
      };
    },
    readGlobalSelection(): { readonly imageSize: string | null; readonly ratio: string | null; readonly outputFormat: string | null } {
      return {
        imageSize: selectedId('global-output-size-selector'),
        ratio: container.querySelector('[data-testid="global-aspect-ratio-selector"]')
          ? selectedId('global-aspect-ratio-selector')
          : null,
        outputFormat: selectedId('global-output-format-selector'),
      };
    },
    async send(prompt: string): Promise<void> {
      await sendPrompt(container, prompt);
      await flush();
      await flush();
    },
    lastSavedPreference(): unknown {
      return fake.spies.saveModelGenerationPreference.mock.lastCall?.[0] ?? null;
    },
    lastSubmittedSelection(): ImageOutputSelection | null {
      const input = fake.spies.submitJob.mock.lastCall?.[0] as {
        readonly input?: {
          readonly output?: {
            readonly selection?: ImageOutputSelection;
          };
        };
      } | undefined;
      return input?.input?.output?.selection ?? null;
    },
  };
}
