import { app } from '../../scripts/app.js';
import { api } from '../../scripts/api.js';
import { createImagenBridgeRuntime } from './protocol.js';

const RUNTIME_KEY = '__IMAGEN_COMFYUI_BRIDGE_RUNTIME_V1__';

app.registerExtension({
  name: 'imagen.frontend-bridge.v1',
  setup() {
    globalThis[RUNTIME_KEY]?.dispose?.();
    const runtime = createImagenBridgeRuntime({
      app,
      api,
      windowObject: window,
    });
    globalThis[RUNTIME_KEY] = runtime;
    runtime.start();
  },
});
