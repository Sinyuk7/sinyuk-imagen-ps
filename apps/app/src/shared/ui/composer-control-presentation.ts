export interface ComposerSummaryLabels {
  readonly model: string;
  readonly template: string;
  readonly ratio: string;
  readonly size: string;
}

/** 按界面宽度限制摘要字段，避免长名称挤占提示区域。 */
function shortValue(value: string, limit: number): string {
  const characters = Array.from(value.trim());
  return characters.length > limit ? `${characters.slice(0, limit - 1).join('')}…` : value.trim();
}

/** 生成设置按钮的当前配置摘要；只包含可读且已解析的值。 */
export function composerSettingsSummary(input: {
  readonly labels: ComposerSummaryLabels;
  readonly model?: string;
  readonly template?: string;
  readonly ratio?: string;
  readonly size?: string;
}): string {
  const entries = [
    input.model ? `${input.labels.model}: ${shortValue(input.model, 24)}` : undefined,
    input.template ? `${input.labels.template}: ${shortValue(input.template, 20)}` : undefined,
    input.ratio ? `${input.labels.ratio}: ${shortValue(input.ratio, 10)}` : undefined,
    input.size ? `${input.labels.size}: ${shortValue(input.size.toUpperCase(), 10)}` : undefined,
  ].filter((entry): entry is string => entry !== undefined);
  return entries.join('\n');
}

/** 依据运行环境的 Navigator 标识选择平台快捷键展示文案。 */
export function composerRunShortcutLabel(userAgent: string, platform: string, labels: { readonly mac: string; readonly windows: string }): string {
  return /mac|iphone|ipad|ipod/iu.test(`${platform} ${userAgent}`) ? labels.mac : labels.windows;
}

/** 判断组合键是否为运行快捷键；普通 Enter、Shift+Enter 与 IME 确认输入均不提交。 */
export function shouldSubmitComposerShortcut(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'isComposing' | 'keyCode'>,
  modifier: 'metaKey' | 'ctrlKey',
): boolean {
  const composing = event.isComposing || event.keyCode === 229;
  return event.key === 'Enter'
    && (modifier === 'metaKey' ? event.metaKey : event.ctrlKey)
    && !event.altKey
    && !event.shiftKey
    && !composing;
}
