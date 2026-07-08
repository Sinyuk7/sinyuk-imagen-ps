import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopupLayerProvider, PopupLayerRoot, usePopupLayer } from '../../../../src/shared/ui/components/popup-layer';
import { UxpTextAreaField } from '../../../../src/shared/ui/components/uxp-form-controls';
import { TextField } from '../../../../src/shared/ui/primitives/native-controls';
import { flush } from '../../../helpers/settings-detail-harness';

let root: Root | undefined;

function createRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return {
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
      };
    },
  } as DOMRect;
}

function OverlayProbe({ open }: { readonly open: boolean }) {
  const popupLayer = usePopupLayer();
  const [element, setElement] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    popupLayer?.setOccludingOverlayElement('test-overlay', open ? element : null);
    return () => {
      popupLayer?.setOccludingOverlayElement('test-overlay', null);
    };
  }, [element, open, popupLayer]);

  return open ? <div ref={setElement} data-testid="popup-layer-test-overlay" /> : null;
}

function PopupLayerOverlapProbe({ open }: { readonly open: boolean }) {
  const [singleLineValue, setSingleLineValue] = useState('/client/openapi/getCredits');
  const [multiLineValue, setMultiLineValue] = useState('Use a crisp editorial tone.');

  return (
    <PopupLayerProvider>
      <div className="panel" data-testid="popup-layer-test-panel">
        <TextField
          data-testid="popup-layer-test-input"
          id="popup-layer-test-input"
          className="field-input ui-field-control"
          value={singleLineValue}
          onValue={setSingleLineValue}
        />
        <UxpTextAreaField
          data-testid="popup-layer-test-textarea"
          id="popup-layer-test-textarea"
          className="field-textarea-input"
          value={multiLineValue}
          onValue={setMultiLineValue}
        />
        <OverlayProbe open={open} />
        <PopupLayerRoot />
      </div>
    </PopupLayerProvider>
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

async function settlePopupLayer(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
  });
  await flush();
  await flush();
}

describe('popup-layer text input overlap contract', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getBoundingClientRect() {
      const testId = this.getAttribute('data-testid');
      if (testId === 'popup-layer-test-panel' || testId === 'popup-layer-root') {
        return createRect(0, 0, 440, 320);
      }
      if (testId === 'popup-layer-test-overlay') {
        return createRect(24, 24, 240, 140);
      }
      if (testId === 'popup-layer-test-input') {
        return createRect(24, 40, 220, 32);
      }
      if (testId === 'popup-layer-test-textarea') {
        return createRect(24, 88, 220, 88);
      }
      return createRect(0, 0, 120, 24);
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupRoot();
  });

  it('suspends both single-line and multi-line editors while an overlay overlaps them', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<PopupLayerOverlapProbe open={false} />);
    });
    await settlePopupLayer();

    const input = container.querySelector<HTMLElement>('[data-testid="popup-layer-test-input"]');
    const textArea = container.querySelector<HTMLElement>('[data-testid="popup-layer-test-textarea"]');
    expect(input?.getAttribute('data-native-editor-suspended')).toBeNull();
    expect(textArea?.getAttribute('data-native-editor-suspended')).toBeNull();

    await act(async () => {
      root!.render(<PopupLayerOverlapProbe open />);
    });
    await settlePopupLayer();

    expect(input?.getAttribute('data-native-editor-suspended')).toBe('true');
    expect(textArea?.getAttribute('data-native-editor-suspended')).toBe('true');

    await act(async () => {
      root!.render(<PopupLayerOverlapProbe open={false} />);
    });
    await settlePopupLayer();

    expect(input?.getAttribute('data-native-editor-suspended')).toBeNull();
    expect(textArea?.getAttribute('data-native-editor-suspended')).toBeNull();
  });
});
