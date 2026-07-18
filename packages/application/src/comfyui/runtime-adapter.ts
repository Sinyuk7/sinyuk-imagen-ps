import {
  createComfyUiExecutionAdapter,
  createComfyUiExecutionError,
  detectComfyUiImageMime,
  type CreateComfyUiExecutionAdapterOptions,
} from '@imagen-ps/execution-backend-comfyui';
import type { ExecutionAdapter } from '@imagen-ps/core-engine';
import type { AssetStore } from '../commands/types.js';

/** Host 负责注入的 ComfyUI transport/Bridge/mask ports。 */
export type ComfyUiExecutionHostPorts = Omit<
  CreateComfyUiExecutionAdapterOptions,
  'assetResolver' | 'assetSink'
>;

let hostPorts: ComfyUiExecutionHostPorts | undefined;

/** 配置或清除当前 host 的 ComfyUI execution ports。 */
export function setComfyUiExecutionHostPorts(ports: ComfyUiExecutionHostPorts | undefined): void {
  hostPorts = ports;
}

function bytesCopy(value: ArrayBuffer | Uint8Array): Uint8Array {
  const source = value instanceof Uint8Array ? value : new Uint8Array(value);
  return source.slice();
}

/** 创建动态读取 host ports 与 existing AssetStore 的 stable adapter。 */
export function createApplicationComfyUiExecutionAdapter(
  getAssetStore: () => AssetStore,
): ExecutionAdapter {
  return {
    adapter: 'comfyui',
    async dispatch(params, context) {
      const current = hostPorts;
      if (current === undefined) {
        throw createComfyUiExecutionError('prepare', 'invalid-connection');
      }
      const adapter = createComfyUiExecutionAdapter({
        ...current,
        assetResolver: {
          async resolve(ref) {
            const raw = await getAssetStore().resolve(ref);
            if (raw === undefined) return undefined;
            const bytes = bytesCopy(raw);
            const mimeType = ref.mimeType ?? detectComfyUiImageMime(bytes);
            if (mimeType === undefined) return undefined;
            return {
              bytes,
              mimeType,
              ...(ref.name === undefined ? {} : { name: ref.name }),
            };
          },
        },
        assetSink: {
          async put(bytes, meta) {
            const copy = bytesCopy(bytes);
            const buffer = new ArrayBuffer(copy.byteLength);
            new Uint8Array(buffer).set(copy);
            return getAssetStore().put(buffer, meta);
          },
        },
      });
      return adapter.dispatch(params, context);
    },
  };
}
