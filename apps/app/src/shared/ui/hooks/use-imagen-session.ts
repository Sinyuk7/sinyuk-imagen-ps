import { useEffect, useMemo, useState } from 'react';
import {
  createImagenSession,
  type ImagenSessionController,
  type ImagenSessionSnapshot,
} from '@imagen-ps/application';
import type { AppServices } from '../../ports/app-services';

const EMPTY_SNAPSHOT: ImagenSessionSnapshot = { jobs: [] };

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
