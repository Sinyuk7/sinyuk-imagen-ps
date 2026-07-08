import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { TextField } from '../../../../src/shared/ui/primitives/native-controls';
import { changeInput, flush } from '../../../helpers/settings-detail-harness';

let root: Root | undefined;

function Probe({ suspended = false }: { readonly suspended?: boolean }) {
  const [value, setValue] = useState('initial');
  return (
    <TextField
      data-testid="text-field-probe"
      id="text-field-probe"
      className="field-input ui-field-control"
      value={value}
      nativeEditorSuspended={suspended}
      onValue={setValue}
    />
  );
}

async function cleanupRoot(): Promise<void> {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
  document.body.innerHTML = '';
}

describe('TextField seam', () => {
  afterEach(async () => {
    await cleanupRoot();
  });

  it('preserves public input updates while using the popup-safe seam', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<Probe />);
    });
    await flush();

    const input = container.querySelector<HTMLInputElement>('[data-testid="text-field-probe"]');
    expect(input).not.toBeNull();
    expect(input?.getAttribute('data-uxp-textinput-native')).toBe('true');

    await act(async () => {
      changeInput(input!, 'next');
    });
    await flush();

    expect(input?.value).toBe('next');
  });

  it('blurs and hides the native editor when suspended', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<Probe />);
    });
    await flush();

    const input = container.querySelector<HTMLInputElement>('[data-testid="text-field-probe"]');
    expect(input).not.toBeNull();
    input?.focus();
    expect(document.activeElement).toBe(input);

    await act(async () => {
      root!.render(<Probe suspended />);
    });
    await flush();

    expect(input?.getAttribute('data-native-editor-suspended')).toBe('true');
    expect(input?.style.display).toBe('none');
    expect(document.activeElement).not.toBe(input);
  });
});
