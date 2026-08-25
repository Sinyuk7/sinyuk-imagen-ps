import type { ApiFormat, ProviderProfile, ProviderSurfaceProjection } from '@imagen-ps/application';
import type { ProviderSurfaceRouteId } from '../../settings-route';

/** App-owned Provider 产品身份；不包含 endpoint 或 protocol config。 */
export interface ProviderSurfaceDefinition {
  readonly id: ProviderSurfaceRouteId;
  readonly implementationId: ProviderSurfaceProjection['identity']['implementationId'];
  readonly label: string;
  readonly shortLabel: string;
}

export const PROVIDER_SURFACE_DEFINITIONS: readonly ProviderSurfaceDefinition[] = [
  { id: 'grsai', implementationId: 'grsai-generate', label: 'GRSAI', shortLabel: 'GR' },
  { id: 'gemini', implementationId: 'gemini-generate-content', label: 'Gemini', shortLabel: 'GE' },
  { id: 'openai-images', implementationId: 'image-endpoint', label: 'GPT Image 2', shortLabel: 'GPT' },
];

/** 根据产品路由身份查找 Application sanitized projection。 */
export function surfaceForRoute(
  surfaces: readonly ProviderSurfaceProjection[],
  routeId: ProviderSurfaceRouteId,
): ProviderSurfaceProjection | undefined {
  const definition = PROVIDER_SURFACE_DEFINITIONS.find((item) => item.id === routeId);
  return definition
    ? surfaces.find((surface) => surface.identity.implementationId === definition.implementationId)
    : undefined;
}

/** 将持久化 Profile 身份映射到专用编辑页面。 */
export function surfaceRouteForApiFormat(apiFormat: ApiFormat): ProviderSurfaceRouteId {
  if (apiFormat === 'grsai') return 'grsai';
  if (apiFormat === 'gemini-generate-content') return 'gemini';
  return 'openai-images';
}

/** 将 Profile 映射到专用编辑页面。 */
export function surfaceRouteForProfile(profile: ProviderProfile): ProviderSurfaceRouteId {
  return surfaceRouteForApiFormat(profile.apiFormat);
}
