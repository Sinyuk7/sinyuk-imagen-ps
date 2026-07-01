import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComposerSelect } from '../src/shared/ui/components/composer-select';

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
      createElement(ComposerSelect, {
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
    );
  });
  props.beforeFlush?.(container);
  await flush();
  await flush();
}

describe('ComposerSelect', () => {
  it('renders trigger with current value', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderSelect(container);

    expect(container.textContent).toContain('Option A');
    expect(container.querySelector('[data-testid="test-select"]')).not.toBeNull();
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
    Object.defineProperty(panel, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: 0,
        left: 0,
        right: 240,
        bottom: 180,
        width: 240,
        height: 180,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      }),
    });

    await renderSelect(container, {
      open: true,
      beforeFlush: (rendered) => {
        const trigger = rendered.querySelector<HTMLElement>('[data-testid="test-select"]')!;
        Object.defineProperty(trigger, 'getBoundingClientRect', {
          configurable: true,
          value: () => ({
            top: 18,
            left: 170,
            right: 226,
            bottom: 42,
            width: 56,
            height: 24,
            x: 170,
            y: 18,
            toJSON: () => undefined,
          }),
        });
      },
    });

    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });
    await flush();

    const popover = panel.querySelector<HTMLElement>('[data-testid="test-select-popover"]')!;
    expect(popover.classList.contains('cmp-select-menu-down')).toBe(true);
    expect(popover.classList.contains('cmp-select-menu-end')).toBe(true);
    expect(popover.style.width).toBe('228px');
    expect(popover.style.maxHeight).toBe('204px');
    expect(popover.style.top).toBe('48px');
    expect(popover.style.right).toBe('14px');
  });

  it('does not allocate a component-local ResizeObserver', async () => {
    const original = globalThis.ResizeObserver;
    const resizeObserverCtor = vi.fn();
    // @ts-expect-error test stub
    globalThis.ResizeObserver = resizeObserverCtor;

    try {
      const container = document.createElement('div');
      document.body.appendChild(container);
      await renderSelect(container, { open: true });
      expect(resizeObserverCtor).not.toHaveBeenCalled();
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
});
