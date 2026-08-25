import { getRuntime } from '../runtime.js';
import { projectProviderSurface, type ProviderSurfaceProjection } from './provider-surface.js';

/** 列出所有已注册 provider，并投影出给 UI/host 可消费的 surface 元数据。 */
export function listProviders(): ProviderSurfaceProjection[] {
  return getRuntime().providerRegistry.list().flatMap((descriptor) => {
    const surface = projectProviderSurface(descriptor);
    return surface ? [surface] : [];
  });
}
