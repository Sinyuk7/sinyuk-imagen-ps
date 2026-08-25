import { getRuntime } from '../runtime.js';
import { projectProviderSurface, type ProviderSurfaceProjection } from './provider-surface.js';

/** 获取指定 provider 的描述，不存在返回 undefined。 */
export function describeProvider(providerId: string): ProviderSurfaceProjection | undefined {
  const descriptor = getRuntime().providerRegistry.get(providerId)?.describe();
  return descriptor ? projectProviderSurface(descriptor) : undefined;
}
