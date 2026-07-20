import fs from 'node:fs';
import path from 'node:path';
import { existingFiles, scanLineRules, sourceExtensions, walkFiles } from './shared.mjs';

const taskSurfaceFiles = [
  'packages/application/src/task.ts',
  'packages/application/src/commands/types.ts',
  'packages/application/src/commands/task-history.ts',
  'packages/application/src/runtime.ts',
  'packages/application/src/session/session.ts',
  'packages/application/src/generation/provider-generation-backend.ts',
  'apps/app/src/shared/domain/task-snapshot.ts',
  'apps/app/src/shared/domain/task-actions.ts',
  'apps/app/src/shared/image/task-resource-resolver.ts',
  'apps/app/src/shared/retention/task-linked-retention.ts',
  'apps/app/src/shared/ui/pages/history-view-model.ts',
  'apps/app/src/shared/ui/pages/history-page.tsx',
  'apps/app/src/adapters/chrome/indexed-db-storage.ts',
  'apps/app/src/adapters/uxp/in-memory-host-storage.ts',
  'apps/app/src/adapters/uxp/uxp-job-history-adapter.ts',
];

const legacyTaskRules = [
  { name: 'Task v2 禁止旧 executionJobId alias', pattern: /\bexecutionJobId\b/ },
  { name: 'Task v2 禁止 Provider-shaped output source', pattern: /\bproviderAssetKind\b/ },
  { name: 'Task v2 禁止旧 TaskExecutionSnapshot contract', pattern: /\bTaskExecutionSnapshot\b/ },
  { name: 'Task v2 attachment 禁止 providerInput writer', pattern: /\bproviderInput\s*:/ },
];

const legacyExecutionFieldRule = {
  name: 'Task v2 generic consumer 禁止读取旧 Provider execution fields',
  pattern: /\.execution\?\.(?:profileId|profileName|providerId|providerName|modelId|modelName)\b/,
};

const coreTaskPattern = /\b(?:TaskRecord|TaskStatus|TaskAttachment|TaskOutput|TaskPlacement|TaskExecutionSummary|TaskExecutionSnapshot|TaskResourceRef|ResolvedTaskResource|TaskStore)\b/;

function requiredTextViolation(repoRoot, file, required, rule) {
  const absolute = path.join(repoRoot, file);
  const text = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
  if (text.includes(required)) {
    return [];
  }
  return [{ rule, file, line: 1, text: `Missing required Task v2 contract: ${required}` }];
}

function sectionViolation(repoRoot, file, start, end, pattern, rule) {
  const absolute = path.join(repoRoot, file);
  if (!fs.existsSync(absolute)) {
    return [{ rule, file, line: 1, text: 'Task v2 storage file is missing.' }];
  }
  const text = fs.readFileSync(absolute, 'utf8');
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  if (startIndex === -1 || endIndex === -1) {
    return [{ rule, file, line: 1, text: 'Task v2 storage section cannot be located.' }];
  }
  const section = text.slice(startIndex, endIndex);
  if (!pattern.test(section)) {
    return [];
  }
  const line = text.slice(0, startIndex + (section.match(pattern)?.index ?? 0)).split('\n').length;
  return [{ rule, file, line, text: section.split('\n')[line - text.slice(0, startIndex).split('\n').length]?.trim() ?? '' }];
}

/** 检查 Task v3 原子切换，不允许旧 writer、fallback 或 Core ownership 回流。 */
export function checkTaskV2(repoRoot) {
  const files = existingFiles(repoRoot, taskSurfaceFiles);
  const genericConsumerFiles = existingFiles(repoRoot, [
    'apps/app/src/shared/domain/task-actions.ts',
    'apps/app/src/shared/ui/pages/history-view-model.ts',
    'apps/app/src/shared/ui/pages/history-page.tsx',
  ]);
  const coreFiles = walkFiles(repoRoot, 'packages/core-engine/src', sourceExtensions);
  const violations = [
    ...scanLineRules(repoRoot, files, legacyTaskRules),
    ...scanLineRules(repoRoot, genericConsumerFiles, [legacyExecutionFieldRule]),
    ...scanLineRules(repoRoot, coreFiles, [{
      name: 'Task contract 必须只由 Application 拥有',
      pattern: coreTaskPattern,
    }]),
  ];

  violations.push(
    ...requiredTextViolation(
      repoRoot,
      'packages/application/src/task.ts',
      'export const TASK_RECORD_SCHEMA_VERSION = 3;',
      'Task record schemaVersion 必须固定为 3',
    ),
    ...requiredTextViolation(
      repoRoot,
      'apps/app/src/shared/domain/task-snapshot.ts',
      'schemaVersion: TASK_RECORD_SCHEMA_VERSION',
      'App Task producer 必须使用 v3 schema authority',
    ),
    ...sectionViolation(
      repoRoot,
      'apps/app/src/adapters/uxp/uxp-job-history-adapter.ts',
      'function parseTaskHistory',
      'function bytesToArrayBuffer',
      /schemaVersion:\s*1/,
      'UXP Task history decoder 禁止 v1 fallback',
    ),
    ...sectionViolation(
      repoRoot,
      'apps/app/src/adapters/uxp/uxp-job-history-adapter.ts',
      'export function createUxpTaskStore',
      'export function createUxpAssetStore',
      /schemaVersion:\s*1/,
      'UXP Task history writer 禁止 v1 schema',
    ),
  );

  return violations;
}
