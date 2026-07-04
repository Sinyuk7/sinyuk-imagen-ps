import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusNotice } from '../src/shared/ui/components/status-notice';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
});

describe('StatusNotice contract', () => {
  it('derives the default icon from tone, keeps announcement off by default, and shows only one copy action', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <StatusNotice
          tone="negative"
          message="Save failed"
          detail="network timeout"
          copyText="network timeout"
        />,
      );
    });

    const notice = container.querySelector<HTMLElement>('.status-notice');
    expect(notice).not.toBeNull();
    expect(notice?.getAttribute('role')).toBeNull();
    expect(notice?.getAttribute('aria-live')).toBeNull();
    expect(container.querySelector('.status-icon')).not.toBeNull();
    expect(container.querySelectorAll('.status-copy')).toHaveLength(1);
  });

  it('allows explicit polite and assertive announcement semantics', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <div>
          <StatusNotice tone="info" message="Refreshing models" announcement="polite" />
          <StatusNotice tone="negative" message="Blocking failure" announcement="assertive" />
        </div>,
      );
    });

    const notices = Array.from(container.querySelectorAll<HTMLElement>('.status-notice'));
    expect(notices).toHaveLength(2);
    expect(notices[0]?.getAttribute('role')).toBe('status');
    expect(notices[0]?.getAttribute('aria-live')).toBe('polite');
    expect(notices[1]?.getAttribute('role')).toBe('alert');
    expect(notices[1]?.getAttribute('aria-live')).toBe('assertive');
  });
});
