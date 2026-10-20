import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComposerImageInputConflict } from '../../../src/shared/ui/components/composer-image-input-conflict';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('Composer image input conflict recovery', () => {
  it('exposes model selection and image removal as independent actions', async () => {
    if (!customElements.get('sp-button')) customElements.define('sp-button', class extends HTMLElement {});
    const onChooseCompatibleModel = vi.fn();
    const onRemoveImages = vi.fn();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root?.render(
      <ComposerImageInputConflict
        message="Attached images are incompatible with the current model."
        chooseCompatibleModelLabel="Choose a compatible model"
        removeImagesLabel="Remove images"
        onChooseCompatibleModel={onChooseCompatibleModel}
        onRemoveImages={onRemoveImages}
      />,
    ));

    const [chooseModel, removeImages] = Array.from(container.querySelectorAll('sp-button'));
    expect(container.textContent).toContain('Attached images are incompatible with the current model.');
    expect(chooseModel?.textContent).toContain('Choose a compatible model');
    expect(removeImages?.textContent).toContain('Remove images');
    await act(async () => chooseModel?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    expect(onChooseCompatibleModel).toHaveBeenCalledOnce();
    expect(onRemoveImages).not.toHaveBeenCalled();
    await act(async () => removeImages?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    expect(onRemoveImages).toHaveBeenCalledOnce();
  });
});
