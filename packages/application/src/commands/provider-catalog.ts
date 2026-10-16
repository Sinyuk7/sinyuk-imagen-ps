import { getProviderCatalog as getCatalog } from '@imagen-ps/providers';
import type { FixedProviderId } from '@imagen-ps/providers';

/** Application seam for the fixed provider catalog projection. */
export function getProviderCatalog(providerId: FixedProviderId): ReturnType<typeof getCatalog> {
  return getCatalog(providerId);
}
