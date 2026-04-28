/**
 * Commands 层公开 API。
 *
 * 导出三命令 + 三类型，作为 UI ↔ runtime 的唯一合规通路。
 * 首版签名在发布后视为 v1 stable。
 *
 * 边界约束：
 * - 仅暴露命令函数与公开类型
 * - 不暴露 runtime 实例本身、getRuntime、store、dispatcher
 */

// Commands
export { submitJob } from './submit-job.js';
export { getJob } from './get-job.js';
export { subscribeJobEvents } from './subscribe-job-events.js';

// Types
export type { CommandResult, SubmitJobInput, JobEventHandler } from './types.js';
