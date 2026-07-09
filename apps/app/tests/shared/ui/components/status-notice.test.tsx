import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusNotice, type StatusNoticeProps } from '../../../../src/shared/ui/components/status-notice';

let root: Root | undefined;

async function cleanupRoot(): Promise<void> {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
  document.body.innerHTML = '';
}

async function renderNotice(props: Partial<StatusNoticeProps> = {}): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root!.render(
      <StatusNotice
        tone="info"
        message="Primary status"
        {...props}
      />,
    );
  });

  return container;
}

describe('StatusNotice', () => {
  afterEach(async () => {
    await cleanupRoot();
  });

  it('renders prose description separately from diagnostic detail', async () => {
    const container = await renderNotice({
      description: 'Create model configuration first.',
      detail: 'provider: 404 not found',
    });

    expect(container.querySelector('.status-description')?.textContent).toBe('Create model configuration first.');
    expect(container.querySelector('.status-detail')?.textContent).toBe('provider: 404 not found');
  });

  it('stays silent by default for inline placement', async () => {
    const container = await renderNotice();
    const notice = container.querySelector('.status-notice');

    expect(notice?.getAttribute('role')).toBeNull();
    expect(notice?.getAttribute('aria-live')).toBeNull();
  });

  it('opts into assertive announcement only when requested', async () => {
    const container = await renderNotice({ announcement: 'assertive' });
    const notice = container.querySelector('.status-notice');

    expect(notice?.getAttribute('role')).toBe('alert');
    expect(notice?.getAttribute('aria-live')).toBe('assertive');
  });
});
