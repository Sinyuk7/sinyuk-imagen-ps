import { useEffect, useMemo, useState } from 'react';
import {
  createImagenSession,
  type ImagenSessionController,
  type ImagenSessionSnapshot,
} from '@imagen-ps/application';
import type { AppServices } from '../../ports/app-services';

const EMPTY_SNAPSHOT: ImagenSessionSnapshot = { jobs: [], queuedTasks: [] };

export interface ImagenSessionBinding {
  readonly session: ImagenSessionController;
  readonly snapshot: ImagenSessionSnapshot;
}

export function useImagenSession(services: AppServices): ImagenSessionBinding {
  const session = useMemo(
    () =>
      createImagenSession({
        commands: {
          submitJob: services.commands.submitJob,
          retryJob: services.commands.retryJob,
          getJob: services.commands.getJob,
          subscribeJobEvents: services.commands.subscribeJobEvents,
          putTaskRecord: services.commands.putTaskRecord,
          getProviderProfile: services.commands.getProviderProfile,
        },
      }),
    [services],
  );
  const [snapshot, setSnapshot] = useState<ImagenSessionSnapshot>(EMPTY_SNAPSHOT);

  useEffect(() => {
    const unsubscribe = session.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      session.dispose();
    };
  }, [session]);

  return { session, snapshot };
}
