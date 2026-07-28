import type { TaskError } from '@imagen-ps/application';

/** UXP 可显示的 ComfyUI 执行失败摘要；不单列重复的 exception type。 */
export interface ComfyUiExecutionErrorDetail {
  readonly nodeId?: string;
  readonly nodeType?: string;
  readonly message?: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function detail(value: unknown): ComfyUiExecutionErrorDetail | undefined {
  if (!record(value) || Object.keys(value).some((key) => !['nodeId', 'nodeType', 'message'].includes(key))) return undefined;
  const nodeId = typeof value.nodeId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.nodeId) ? value.nodeId : undefined;
  const nodeType = typeof value.nodeType === 'string' && /^[A-Za-z][A-Za-z0-9_. -]{0,127}$/.test(value.nodeType) ? value.nodeType : undefined;
  const message = typeof value.message === 'string' && value.message.trim().length > 0 && new TextEncoder().encode(value.message).byteLength <= 512 && !/[\u0000-\u001f\u007f]/.test(value.message)
    && !/(?:https?|file):\/\/|(?:^|[\s("' ])(?:\/|~\/|[A-Za-z]:[\\/])|\b(?:sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,})\b/i.test(value.message)
    ? value.message.trim()
    : undefined;
  return nodeId === undefined && nodeType === undefined && message === undefined
    ? undefined
    : { ...(nodeId === undefined ? {} : { nodeId }), ...(nodeType === undefined ? {} : { nodeType }), ...(message === undefined ? {} : { message }) };
}

/** 仅接受本应用生成的 bounded ComfyUI History execution error。 */
export function comfyUiExecutionErrorFromJob(error: unknown): ComfyUiExecutionErrorDetail | undefined {
  if (!record(error) || error.category !== 'execution' || error.message !== 'ComfyUI execution failed.' || !record(error.details) || error.details.code !== 'execution-failed') return undefined;
  return detail(error.details.executionError);
}

/** 从 durable Task error 恢复同一份 bounded 失败摘要。 */
export function comfyUiExecutionErrorFromTask(error: TaskError | undefined): ComfyUiExecutionErrorDetail | undefined {
  if (error?.category !== 'execution' || error.message !== 'ComfyUI execution failed.' || error.code !== 'execution-failed') return undefined;
  return detail(error.executionError);
}

/** 节点名与节点 ID 合并为单行，避免重复字段。 */
export function comfyUiExecutionNodeLabel(error: ComfyUiExecutionErrorDetail): string | undefined {
  if (error.nodeType === undefined) return error.nodeId;
  return error.nodeId === undefined ? error.nodeType : `${error.nodeType} (ID: ${error.nodeId})`;
}
