import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IconSelect } from '../src/shared/ui/components/icon-select';
import { PopupLayerProvider, PopupLayerRoot } from '../src/shared/ui/components/popup-layer';
import { TextSelect } from '../src/shared/ui/components/text-select';

let root: Root | undefined;
const originalResizeObserver = globalThis.ResizeObserver;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
  globalThis.ResizeObserver = originalResizeObserver;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function flushFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  });
  await flush();
}

function rectFrom(input: {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}): DOMRect {
  return {
    top: input.top,
    left: input.left,
    right: input.left + input.width,
    bottom: input.top + input.height,
    width: input.width,
    height: input.height,
    x: input.left,
    y: input.top,
    toJSON: () => undefined,
  } as DOMRect;
}

function installRect(element: HTMLElement, input: {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => rectFrom(input),
  });
}

function withPopupLayer(child: ReactElement): ReactElement {
  return createElement(PopupLayerProvider, null, child, createElement(PopupLayerRoot));
}

async function renderSelect(
  container: HTMLElement,
  props: {
    open?: boolean;
    selectedId?: string;
    onSelect?: (id: string) => void;
    onOpenChange?: (open: boolean) => void;
    disabled?: boolean;
    beforeFlush?: (container: HTMLElement) => void;
  } = {},
) {
  const selectedId = props.selectedId ?? 'option-a';
  root = createRoot(container);
  await act(async () => {
    root!.render(
      withPopupLayer(
        createElement(TextSelect, {
          label: 'Test Select',
          value: 'Option A',
          open: props.open ?? false,
          onOpenChange: props.onOpenChange ?? (() => undefined),
          options: [
            { id: 'option-a', label: 'Option A' },
            { id: 'option-b', label: 'Option B' },
            { id: 'option-c', label: 'Option C', icon: 'add' },
          ],
          selectedId,
          onSelect: props.onSelect ?? (() => undefined),
          testId: 'test-select',
          disabled: props.disabled,
        }),
      ),
    );
  });
  props.beforeFlush?.(container);
  await flush();
  await flush();
  await flush();
  await flushFrame();
}

describe('ComposerSelect', () => {
  it('renders trigger with current value', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderSelect(container);

    expect(container.textContent).toContain('Option A');
    expect(container.querySelector('[data-testid="test-select"]')).not.toBeNull();
  });

  it('renders icon trigger when icon variant is used', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        withPopupLayer(createElement(IconSelect, {
          label: 'Test Select',
          value: 'Option A',
          icon: 'add',
          open: false,
          onOpenChange: () => undefined,
          options: [{ id: 'option-a', label: 'Option A' }],
          selectedId: 'option-a',
          onSelect: () => undefined,
          testId: 'icon-select',
        })),
      );
    });
    await flush();

    expect(container.querySelector('.cmp-chip-icon')).not.toBeNull();
    expect(container.querySelector('.cmp-chip-leading-proxy-icon')).not.toBeNull();
  });

  it('renders icon trigger value on the overlay rail to avoid UXP button child collapse', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        withPopupLayer(createElement(IconSelect, {
          label: 'Model',
          value: 'gemini-3.1-flash-lite-image-ultra-long-preview-model',
          icon: 'algorithm',
          open: false,
          onOpenChange: () => undefined,
          options: [
            {
              id: 'gemini',
              label: 'gemini-3.1-flash-lite-image-ultra-long-preview-model',
            },
          ],
          selectedId: 'gemini',
          onSelect: () => undefined,
          testId: 'icon-select',
          containerClassName: 'cmp-select cmp-select-model',
        })),
      );
    });
    await flush();

    const trigger = container.querySelector<HTMLElement>('[data-testid="icon-select"]')!;
    const overlayValue = container.querySelector('.cmp-chip-overlay-value-icon');
    const a11ySlot = container.querySelector('.cmp-chip-a11y-value-icon');

    expect(trigger.textContent).toBe('');
    expect(trigger.getAttribute('aria-label')).toBe('Model');
    expect(overlayValue?.textContent).toBe('gemini-3.1-flash-lite-image-ultra-long-preview-model');
    expect(a11ySlot?.textContent).toBe('');
  });

  it('keeps long icon-trigger values inside the shared overlay host contract', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        withPopupLayer(createElement(IconSelect, {
          label: 'Model',
          value: 'gemini-3.1-flash-lite-imagen-very-long-model-name-preview',
          icon: 'algorithm',
          open: false,
          onOpenChange: () => undefined,
          options: [
            {
              id: 'gemini-3.1-flash-lite-imagen-very-long-model-name-preview',
              label: 'gemini-3.1-flash-lite-imagen-very-long-model-name-preview',
            },
          ],
          selectedId: 'gemini-3.1-flash-lite-imagen-very-long-model-name-preview',
          onSelect: () => undefined,
          testId: 'long-icon-select',
          containerClassName: 'cmp-select cmp-select-model',
        })),
      );
    });
    await flush();

    const host = container.querySelector('.ui-overlay-icon-host');
    const trigger = container.querySelector('.cmp-chip-icon');
    const overlayLayer = container.querySelector('.cmp-chip-host > .ui-overlay-icon-layer');
    const overlayInner = container.querySelector('.cmp-chip-overlay-inner-icon');
    const overlayValue = container.querySelector('.cmp-chip-overlay-value-icon');

    expect(host).not.toBeNull();
    expect(trigger).not.toBeNull();
    expect(overlayLayer).not.toBeNull();
    expect(overlayInner).not.toBeNull();
    expect(overlayValue?.textContent).toContain('gemini-3.1-flash-lite-imagen');
  });

  it('renders text trigger without icon slot when text variant is used', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        withPopupLayer(createElement(TextSelect, {
          label: 'Test Select',
          value: 'Option A',
          open: false,
          onOpenChange: () => undefined,
          options: [{ id: 'option-a', label: 'Option A' }],
          selectedId: 'option-a',
          onSelect: () => undefined,
          testId: 'text-select',
        })),
      );
    });
    await flush();

    expect(container.querySelector('.cmp-chip-text')).not.toBeNull();
    expect(container.querySelector('.cmp-chip-leading-slot')).toBeNull();
  });

  it('opens menu when trigger is clicked', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let open = false;
    const onOpenChange = (value: boolean) => {
      open = value;
    };
    await renderSelect(container, { onOpenChange });

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="test-select"]')!.click();
    });
    await flush();

    expect(open).toBe(true);
  });

  it('renders menu options when open', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderSelect(container, { open: true });

    expect(container.querySelector('[data-testid="test-select-menu"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="test-select-option-option-a"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="test-select-option-option-b"]')).not.toBeNull();
  });

  it('links the trigger and listbox through the select-like aria contract', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderSelect(container, { open: true });

    const trigger = container.querySelector<HTMLElement>('[data-testid="test-select"]')!;
    const menu = container.querySelector<HTMLElement>('[data-testid="test-select-menu"]')!;

    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(menu.id);
    expect(menu.getAttribute('role')).toBe('listbox');
  });

  it('marks selected option with aria-selected', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderSelect(container, { open: true, selectedId: 'option-b' });

    const selectedItem = container.querySelector('[data-testid="test-select-option-option-b"]') as HTMLElement;
    expect(selectedItem).not.toBeNull();
    expect(selectedItem.getAttribute('role')).toBe('option');
    expect(selectedItem.getAttribute('aria-selected')).toBe('true');
  });

  it('selects an option when clicked', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let selected: string | undefined;
    let open = true;
    await renderSelect(container, {
      open: true,
      onSelect: (id) => {
        selected = id;
      },
      onOpenChange: (value) => {
        open = value;
      },
    });

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="test-select-option-option-b"]')!.click();
    });
    await flush();

    expect(selected).toBe('option-b');
    expect(open).toBe(false);
  });

  it('returns focus to the trigger when Escape closes the menu', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let open = true;
    await renderSelect(container, {
      open: true,
      onOpenChange: (value) => {
        open = value;
      },
    });

    const trigger = container.querySelector<HTMLElement>('[data-testid="test-select"]')!;
    const menu = container.querySelector<HTMLElement>('[data-testid="test-select-menu"]')!;

    await act(async () => {
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await flush();

    expect(open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('stops press-start events from bubbling through menu options without canceling native click', async () => {
    const container = document.createElement('div');
    const parent = document.createElement('div');
    let mouseDownCount = 0;
    let pointerDownCount = 0;
    parent.addEventListener('mousedown', () => {
      mouseDownCount += 1;
    });
    parent.addEventListener('pointerdown', () => {
      pointerDownCount += 1;
    });
    parent.appendChild(container);
    document.body.appendChild(parent);
    await renderSelect(container, { open: true });

    const option = container.querySelector<HTMLElement>('[data-testid="test-select-option-option-b"]')!;
    const mouseDownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });

    await act(async () => {
      option.dispatchEvent(mouseDownEvent);
    });
    await flush();

    expect(mouseDownEvent.defaultPrevented).toBe(false);
    expect(mouseDownCount).toBe(0);

    if (typeof PointerEvent !== 'undefined') {
      const pointerDownEvent = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
      await act(async () => {
        option.dispatchEvent(pointerDownEvent);
      });
      await flush();

      expect(pointerDownEvent.defaultPrevented).toBe(false);
      expect(pointerDownCount).toBe(0);
    }
  });

  it('opens icon select when the overlay host receives the UXP click target', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let open = false;
    root = createRoot(container);
    await act(async () => {
      root!.render(
        withPopupLayer(createElement(IconSelect, {
          label: 'Model',
          value: 'Option A',
          icon: 'algorithm',
          open: false,
          onOpenChange: (value) => {
            open = value;
          },
          options: [{ id: 'option-a', label: 'Option A' }],
          selectedId: 'option-a',
          onSelect: () => undefined,
          testId: 'icon-select',
        })),
      );
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('.ui-overlay-icon-host')!.click();
    });
    await flush();

    expect(open).toBe(true);
  });

  it('keeps compact menu options vertically contiguous', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      root = createRoot(container);
      root.render(
        withPopupLayer(createElement(IconSelect, {
          label: 'Output Size',
          value: '2K',
          icon: 'image-auto-mode',
          open: true,
          onOpenChange: () => undefined,
          options: [
            { id: '512', label: '512' },
            { id: '1k', label: '1K' },
            { id: '2k', label: '2K' },
            { id: '4k', label: '4K' },
          ],
          selectedId: '2k',
          onSelect: () => undefined,
          testId: 'compact-select',
          menuClassName: 'cmp-select-menu cmp-select-menu-compact',
        })),
      );
    });
    await flush();
    await flush();

    const options = Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="compact-select-option-"]'));
    expect(options).toHaveLength(4);
    for (let index = 0; index < options.length - 1; index += 1) {
      expect(options[index + 1]!.offsetTop).toBe(options[index]!.offsetTop + options[index]!.offsetHeight);
    }
  });

  it('closes menu when trigger is clicked while open', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let open = true;
    await renderSelect(container, {
      open: true,
      onOpenChange: (value) => {
        open = value;
      },
    });

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="test-select"]')!.click();
    });
    await flush();

    expect(open).toBe(false);
  });

  it('does not open when disabled', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let open = false;
    await renderSelect(container, {
      disabled: true,
      onOpenChange: (value) => {
        open = value;
      },
    });

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="test-select"]')!.click();
    });
    await flush();

    expect(open).toBe(false);
  });

  it('closes menu on Escape key', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let open = true;
    await renderSelect(container, {
      open: true,
      onOpenChange: (value) => {
        open = value;
      },
    });

    const menu = container.querySelector<HTMLElement>('[data-testid="test-select-menu"]');
    expect(menu).not.toBeNull();

    await act(async () => {
      menu!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await flush();

    expect(open).toBe(false);
  });

  it('constrains open menu to the nearest panel and flips direction when needed', async () => {
    const container = document.createElement('div');
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.appendChild(container);
    document.body.appendChild(panel);
    installRect(panel, { top: 0, left: 0, width: 240, height: 180 });

    await renderSelect(container, {
      open: true,
      beforeFlush: (rendered) => {
        installRect(rendered.querySelector<HTMLElement>('[data-testid="popup-layer-root"]')!, {
          top: 0,
          left: 0,
          width: 240,
          height: 180,
        });
        const host = rendered.querySelector<HTMLElement>('[data-testid="test-select"]')!.closest('.ui-overlay-icon-host')!;
        installRect(host, { top: 18, left: 170, width: 56, height: 24 });
        const menu = rendered.querySelector<HTMLElement>('[data-testid="test-select-menu"]');
        if (menu) {
          installRect(menu, { top: 0, left: 0, width: 216, height: 96 });
        }
      },
    });

    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });
    await flushFrame();

    const popover = panel.querySelector<HTMLElement>('[data-testid="test-select-popover"]')!;
    expect(popover.classList.contains('cmp-select-menu-down')).toBe(true);
    expect(popover.classList.contains('cmp-select-menu-end')).toBe(true);
    expect(popover.style.width).toBe('216px');
    expect(popover.style.maxHeight).toBe('120px');
    expect(popover.style.top).toBe('48px');
    expect(popover.style.right).toBe('12px');
  });

  it('renders a panel underlay that closes the menu without clicking through', async () => {
    const container = document.createElement('div');
    const panel = document.createElement('div');
    panel.className = 'panel';
    let backgroundClicks = 0;
    panel.addEventListener('click', () => {
      backgroundClicks += 1;
    });
    panel.appendChild(container);
    document.body.appendChild(panel);

    let open = true;
    await renderSelect(container, {
      open: true,
      onOpenChange: (value) => {
        open = value;
      },
    });

    const underlay = panel.querySelector<HTMLElement>('[data-testid="test-select-underlay"]')!;
    expect(underlay).not.toBeNull();
    const underlayClick = new MouseEvent('click', { bubbles: true, cancelable: true });

    await act(async () => {
      underlay.dispatchEvent(underlayClick);
    });
    await flush();

    expect(open).toBe(false);
    expect(underlayClick.defaultPrevented).toBe(true);
    expect(backgroundClicks).toBe(0);
  });

  it('keeps only one ComposerSelect popup active within the shared popup layer', async () => {
    const container = document.createElement('div');
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.appendChild(container);
    document.body.appendChild(panel);
    const openCalls: Array<{ id: string; open: boolean }> = [];
    root = createRoot(container);
    await act(async () => {
      root!.render(
        createElement(PopupLayerProvider, null,
          createElement(TextSelect, {
            label: 'First',
            value: 'One',
            open: true,
            onOpenChange: (open) => openCalls.push({ id: 'first', open }),
            options: [{ id: 'one', label: 'One' }],
            selectedId: 'one',
            onSelect: () => undefined,
            testId: 'first-select',
            triggerId: 'first-select-trigger',
          }),
          createElement(TextSelect, {
            label: 'Second',
            value: 'Two',
            open: true,
            onOpenChange: (open) => openCalls.push({ id: 'second', open }),
            options: [{ id: 'two', label: 'Two' }],
            selectedId: 'two',
            onSelect: () => undefined,
            testId: 'second-select',
            triggerId: 'second-select-trigger',
          }),
          createElement(PopupLayerRoot),
        ),
      );
    });
    await flush();
    await flush();

    expect(openCalls).toContainEqual({ id: 'first', open: false });
  });

  it('repositions the portaled menu when a scroll ancestor moves the trigger', async () => {
    const container = document.createElement('div');
    const panel = document.createElement('div');
    const scroll = document.createElement('div');
    panel.className = 'panel';
    scroll.className = 'scroll';
    scroll.appendChild(container);
    panel.appendChild(scroll);
    document.body.appendChild(panel);
    installRect(panel, { top: 0, left: 0, width: 320, height: 360 });
    let triggerTop = 80;

    await renderSelect(container, {
      open: true,
      beforeFlush: (rendered) => {
        installRect(rendered.querySelector<HTMLElement>('[data-testid="popup-layer-root"]')!, {
          top: 0,
          left: 0,
          width: 320,
          height: 360,
        });
        const host = rendered.querySelector<HTMLElement>('[data-testid="test-select"]')!.closest('.ui-overlay-icon-host')!;
        Object.defineProperty(host, 'getBoundingClientRect', {
          configurable: true,
          value: () => rectFrom({ top: triggerTop, left: 24, width: 140, height: 24 }),
        });
      },
    });

    await flush();
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });
    await flush();
    const popover = panel.querySelector<HTMLElement>('[data-testid="test-select-popover"]')!;
    expect(popover.style.top).toBe('110px');

    triggerTop = 112;
    await act(async () => {
      scroll.dispatchEvent(new Event('scroll'));
    });
    await flushFrame();

    expect(popover.style.top).toBe('142px');
  });

  it('observes popup root, trigger anchor, and menu content for placement changes', async () => {
    const original = globalThis.ResizeObserver;
    const observed: Element[] = [];
    let resizeCallback: ResizeObserverCallback | undefined;
    class MockResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe(element: Element) {
        observed.push(element);
      }
      disconnect() {
        observed.length = 0;
      }
    }
    globalThis.ResizeObserver = MockResizeObserver as typeof ResizeObserver;

    try {
      const container = document.createElement('div');
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.appendChild(container);
      installRect(panel, { top: 0, left: 0, width: 360, height: 320 });
      document.body.appendChild(panel);
      let triggerTop = 80;
      await renderSelect(container, {
        open: true,
        beforeFlush: (rendered) => {
          installRect(rendered.querySelector<HTMLElement>('[data-testid="popup-layer-root"]')!, {
            top: 0,
            left: 0,
            width: 360,
            height: 320,
          });
          const host = rendered.querySelector<HTMLElement>('[data-testid="test-select"]')!.closest('.ui-overlay-icon-host')!;
          Object.defineProperty(host, 'getBoundingClientRect', {
            configurable: true,
            value: () => rectFrom({ top: triggerTop, left: 40, width: 140, height: 24 }),
          });
        },
      });

      installRect(container.querySelector<HTMLElement>('[data-testid="test-select-menu"]')!, {
        top: 0,
        left: 0,
        width: 180,
        height: 96,
      });
      const popover = container.querySelector<HTMLElement>('[data-testid="test-select-popover"]')!;
      expect(observed.some((element) => (element as HTMLElement).dataset.testid === 'popup-layer-root')).toBe(true);
      expect(observed.some((element) => (element as HTMLElement).classList.contains('ui-overlay-icon-host'))).toBe(true);
      expect(observed.some((element) => (element as HTMLElement).dataset.testid === 'test-select-menu')).toBe(true);

      triggerTop = 104;
      await act(async () => {
        resizeCallback?.([], {} as ResizeObserver);
      });
      await flushFrame();

      expect(popover.style.top).toBe('134px');
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
});
