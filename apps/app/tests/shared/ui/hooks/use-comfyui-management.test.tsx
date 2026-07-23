import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComfyUiManagementController } from '../../../../src/shared/ui/hooks/use-comfyui-management';
import { useComfyUiManagement } from '../../../../src/shared/ui/hooks/use-comfyui-management';
import type { ComfyUiManagementPort } from '../../../../src/shared/ports/comfyui-management';
import { createComfyUiManagementFake } from '../../../helpers/harness/comfyui-management.fake';

function Probe({ service, onChange }: {
  readonly service: ComfyUiManagementPort;
  readonly onChange: (controller: ComfyUiManagementController) => void;
}) {
  const controller = useComfyUiManagement(service);
  useEffect(() => onChange(controller), [controller, onChange]);
  return <output data-testid="state">{controller.runtime?.identity.displayName ?? controller.error ?? 'empty'}</output>;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('useComfyUiManagement', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the latest runtime when an older reload rejects late', async () => {
    const fake = createComfyUiManagementFake({ baseUrl: 'https://comfy.example.test' });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let controller: ComfyUiManagementController | undefined;
    const onChange = (value: ComfyUiManagementController): void => { controller = value; };

    await act(async () => {
      root.render(<Probe service={fake.service} onChange={onChange} />);
      await flush();
    });
    const initial = controller!.runtime!;
    expect(initial.identity.displayName).toBe('D01 Studio');

    let rejectOlder!: (cause: Error) => void;
    const olderSelection = new Promise<never>((_resolve, reject) => { rejectOlder = reject; });
    vi.spyOn(fake.service, 'selectWorkflow')
      .mockImplementationOnce(async () => olderSelection)
      .mockResolvedValueOnce({
        ...initial,
        identity: { ...initial.identity, displayName: 'Fresh Workflow' },
      });

    let olderReload!: Promise<void>;
    await act(async () => {
      olderReload = controller!.reload();
      await flush();
    });
    await act(async () => {
      await controller!.reload();
    });
    expect(container.textContent).toBe('Fresh Workflow');

    await act(async () => {
      rejectOlder(new Error('stale failure'));
      await olderReload;
    });
    expect(container.textContent).toBe('Fresh Workflow');

    await act(async () => { root.unmount(); });
  });
});
