/** 设置区域的唯一导航状态。 */
export type SettingsTab = 'provider' | 'comfyui' | 'general';

/** Provider 产品 surface 的路由身份。 */
export type ProviderSurfaceRouteId = 'grsai' | 'gemini' | 'openai-images';

/** 设置根页和详情页的层级关系。 */
export type SettingsRoute =
  | { readonly kind: 'root'; readonly tab: SettingsTab }
  | { readonly kind: 'provider-account'; readonly providerId: 'grsai' | 'runninghub' }
  | { readonly kind: 'global-settings' }
  | { readonly kind: 'prompt-settings' }
  | { readonly kind: 'prompt-preset-detail'; readonly presetId: string | null };

/** 详情页返回其所属的根设置页。 */
export function settingsBackRoute(route: SettingsRoute): SettingsRoute | 'main' {
  switch (route.kind) {
    case 'root':
      return 'main';
    case 'provider-account':
      return { kind: 'root', tab: 'provider' };
    case 'global-settings':
    case 'prompt-settings':
      return { kind: 'root', tab: 'general' };
    case 'prompt-preset-detail':
      return { kind: 'prompt-settings' };
  }
}
