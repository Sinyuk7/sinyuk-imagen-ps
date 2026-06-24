import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
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
});
