import type { createComfyUiManagementService } from '@imagen-ps/application';

/** App UI 可调用的 Application-owned ComfyUI 管理服务。 */
export type ComfyUiManagementPort = ReturnType<typeof createComfyUiManagementService>;
