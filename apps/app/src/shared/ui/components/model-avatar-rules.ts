/**
 * Header model/avatar 图标选择规则。
 *
 * 规则按顺序匹配；谁先写谁生效。
 */
import type { ModelAvatarIconName } from './generated/model-avatar-icons';

export interface ResolveModelAvatarIconInput {
  readonly modelId?: string;
  readonly providerId?: string;
  readonly providerName?: string;
}

const ORDERED_RULES: ReadonlyArray<{
  readonly icon: ModelAvatarIconName;
  readonly matches: ReadonlyArray<string>;
  readonly fields: ReadonlyArray<'modelId' | 'providerId' | 'providerName'>;
}> = [
  { icon: 'debug-mock', matches: ['mock'], fields: ['providerId', 'providerName'] },
  { icon: 'nano-banana', matches: ['banana', 'gemini'], fields: ['modelId'] },
  { icon: 'gpt', matches: ['gpt'], fields: ['modelId'] },
  { icon: 'qwen', matches: ['qwen'], fields: ['modelId'] },
  { icon: 'grok', matches: ['grok'], fields: ['modelId'] },
  { icon: 'jimeng', matches: ['jimeng', '即梦'], fields: ['modelId'] },
  { icon: 'google', matches: ['google'], fields: ['modelId'] },
  { icon: 'openapi', matches: ['openapi'], fields: ['modelId'] },
];

export function resolveModelAvatarIcon({
  modelId,
  providerId,
  providerName,
}: ResolveModelAvatarIconInput): ModelAvatarIconName {
  const normalized = {
    modelId: modelId?.toLowerCase() ?? '',
    providerId: providerId?.toLowerCase() ?? '',
    providerName: providerName?.toLowerCase() ?? '',
  };

  for (const rule of ORDERED_RULES) {
    for (const field of rule.fields) {
      const value = normalized[field];
      if (!value) {
        continue;
      }
      if (rule.matches.some((fragment) => value.includes(fragment.toLowerCase()))) {
        return rule.icon;
      }
    }
  }

  return 'default';
}
