import { existingFiles, scanLineRules } from './shared.mjs';

const highAuthorityDocs = [
  'AGENTS.md',
  'README.md',
  'CLA.md',
  'docs/ENGINEERING_CONTEXT.md',
  'docs/TESTING.md',
  'docs/PROVIDER_SUPPORT.md',
  'docs/agent/LOOP.md',
  'apps/app/AGENTS.md',
  'packages/AGENTS.md',
  'packages/application/AGENTS.md',
  'packages/core-engine/AGENTS.md',
  'packages/providers/AGENTS.md',
  'packages/foundation/AGENTS.md',
];

const currentStatePhraseRules = [
  /\bStable\s+v\d+(?:\.\d+)?\b/i,
  /\bcompatibility layers?\b/i,
  /\bmigration paths?\b/i,
  /\bold[- ]contract support\b/i,
  /\bold contract\b/i,
  /\blegacy fallbacks?\b/i,
  /\bdeprecated behavior preservation\b/i,
  /\bphased rollout logic\b/i,
  /\bupgrade paths?\b/i,
  /\bspeculative future-proofing\b/i,
  /\bfuture support\b/i,
  /\bbackward compatibility\b/i,
  /\bforward compatibility\b/i,
].map((pattern) => ({
  name: '高权威文档不能声明 legacy/compat/migration/rollout/future-support 契约',
  pattern,
}));

export function checkDocs(repoRoot) {
  return scanLineRules(repoRoot, existingFiles(repoRoot, highAuthorityDocs), currentStatePhraseRules);
}
