import {
  createImagenSession,
  getJob,
  retryJob,
  submitJob,
  subscribeJobEvents,
  type ImagenSessionController,
} from '@imagen-ps/application';

let session: ImagenSessionController | null = null;

export function getCliSession(): ImagenSessionController {
  if (session === null) {
    session = createImagenSession({
      commands: {
        submitJob,
        retryJob,
        getJob,
        subscribeJobEvents,
      },
    });
  }
  return session;
}
