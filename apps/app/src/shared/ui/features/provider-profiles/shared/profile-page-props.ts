import type { ProviderProfile, ProviderSurfaceProjection } from '@imagen-ps/application';

/** 三个专用 Profile 页面的共同导航输入。 */
export interface ProviderProfilePageProps {
  readonly surface: ProviderSurfaceProjection;
  readonly profile?: ProviderProfile;
  readonly existingDisplayNames: readonly string[];
  readonly onBack: () => void;
  readonly onSaved: (profile: ProviderProfile) => Promise<void>;
  readonly onDeleted: (profileId: string) => Promise<void>;
}

/** 为新 Profile 生成本地唯一标识。 */
export function createProviderProfileId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 将 Application command error 转为页面错误。 */
export function commandError(result: { readonly error: { readonly category: string; readonly message: string } }): Error {
  return new Error(`${result.error.category}: ${result.error.message}`);
}
