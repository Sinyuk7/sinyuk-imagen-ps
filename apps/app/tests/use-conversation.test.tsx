import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '@imagen-ps/application';
import { AppServicesProvider } from '../src/app-services/app-services-context';
import { useConversation, type ConversationController } from '../src/shared/ui/hooks/use-conversation';
import { useImagenSession } from '../src/shared/ui/hooks/use-imagen-session';
import { createFakeServices } from './fakes';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
});

function failedJob(input: Record<string, unknown>): Job {
  return {
    id: 'job-failed',
    status: 'failed',
    input,
    output: undefined,
    error: { category: 'provider', message: 'provider failed' },
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:01.000Z',
  };
}

async function mountProbe(services: ReturnType<typeof createFakeServices>['services']): Promise<{
  getController: () => ConversationController;
  container: HTMLDivElement;
}> {
  let controller: ConversationController | undefined;
  function Probe() {
    const session = useImagenSession(services);
    controller = useConversation(services, session);
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <AppServicesProvider services={services}>
        <Probe />
      </AppServicesProvider>,
    );
  });
  return { getController: () => controller!, container };
}

describe('useConversation', () => {
  it('submits generation through CommandsPort.submitJob', async () => {
    const { services, spies } = createFakeServices();
    let controller: ConversationController | undefined;

    function Probe() {
      const session = useImagenSession(services);
      controller = useConversation(services, session);
      return null;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppServicesProvider services={services}>
          <Probe />
        </AppServicesProvider>,
      );
    });

    await act(async () => {
      await controller!.submit({
        prompt: 'make an image',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
      });
    });

    expect(spies.subscribeJobEvents).toHaveBeenCalledTimes(1);
    expect(spies.submitJob).toHaveBeenCalledWith({
      workflow: 'provider-generate',
      input: expect.objectContaining({
        profileId: 'mock-profile',
        prompt: 'make an image',
        providerOptions: { model: 'mock-image-v1' },
      }),
    });
    expect(controller!.rounds[0]?.status).toBe('ok');
    expect(controller!.rounds[0]?.previews[0]?.asset.name).toBe('result.png');
  });

  it('blocks same-tick double submit to a single submitJob call (UI ref-gate)', async () => {
    const { services, spies } = createFakeServices();
    const { getController } = await mountProbe(services);

    await act(async () => {
      const a = getController().submit({
        prompt: 'make an image',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
      });
      const b = getController().submit({
        prompt: 'make an image',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
      });
      await Promise.all([a, b]);
    });

    // 同 tick 双击只穿透一次。
    expect(spies.submitJob).toHaveBeenCalledTimes(1);
    expect(getController().rounds).toHaveLength(1);
  });

  it('releases the submit gate after completion so a later send proceeds', async () => {
    const { services, spies } = createFakeServices();
    const { getController } = await mountProbe(services);

    await act(async () => {
      await getController().submit({
        prompt: 'first',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
      });
    });
    await act(async () => {
      await getController().submit({
        prompt: 'second',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
      });
    });

    // 两次独立、先后 send 各自穿透（锁已释放）。
    expect(spies.submitJob).toHaveBeenCalledTimes(2);
    expect(getController().rounds).toHaveLength(2);
  });

  it('routes a successful-round retry (regenerate) through submitJob, not retryJob', async () => {
    const { services, spies } = createFakeServices();
    const { getController } = await mountProbe(services);

    await act(async () => {
      await getController().submit({
        prompt: 'make an image',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
      });
    });
    expect(getController().rounds[0]?.status).toBe('ok');
    const roundId = getController().rounds[0]!.id;

    await act(async () => {
      await getController().retry(roundId);
    });

    // regenerate → submitJob 路径（不调用 retryJob）。
    expect(spies.submitJob).toHaveBeenCalledTimes(2);
    expect(vi.mocked(services.commands.retryJob)).not.toHaveBeenCalled();
  });

  it('blocks same-tick double retry on a failed round to a single retryJob call', async () => {
    const { services } = createFakeServices();
    const retryJobSpy = vi.fn(async () => ({
      ok: true as const,
      value: {
        id: 'job-retry',
        status: 'completed',
        input: { _workflowName: 'provider-generate' },
        output: { image: { assets: [] } },
        error: undefined,
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:01.000Z',
      } satisfies Job,
    }));
    // 让 submit 产生一个 failed round（status==='err'），retry 走 retryJob 路径。
    services.commands.submitJob = vi.fn(async (input: { input: Record<string, unknown> }) => ({
      ok: true as const,
      value: failedJob(input.input),
    }));
    services.commands.retryJob = retryJobSpy;

    const { getController } = await mountProbe(services);

    await act(async () => {
      await getController().submit({
        prompt: 'will fail',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
      });
    });
    expect(getController().rounds[0]?.status).toBe('err');
    const roundId = getController().rounds[0]!.id;

    await act(async () => {
      const a = getController().retry(roundId);
      const b = getController().retry(roundId);
      await Promise.all([a, b]);
    });

    // 同 tick 双击 retry 只穿透一次 retryJob。
    expect(retryJobSpy).toHaveBeenCalledTimes(1);
  });
});
