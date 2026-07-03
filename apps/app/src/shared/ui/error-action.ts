export type ErrorActionCategory =
  | 'authentication-failed'
  | 'model-unavailable'
  | 'size-unsupported'
  | 'image-input-unreadable'
  | 'provider-protocol-incompatible'
  | 'provider-temporarily-unavailable'
  | 'placement-conflict'
  | 'unknown';

export type ErrorPrimaryAction =
  | 'open-provider-settings'
  | 'choose-supported-size'
  | 'choose-compatible-model'
  | 'replace-image'
  | 'copy-error-details'
  | 'fill-composer-from-failed-round';

export interface ClassifiedRoundError {
  readonly category: ErrorActionCategory;
  readonly primaryAction: ErrorPrimaryAction;
  readonly message: string;
  readonly detail?: string;
  readonly requestId?: string;
}

function requestIdFrom(message: string): string | undefined {
  return /\(?\brequest[\s_-]*id\b\s*[:：]\s*([^\s)）]+)\)?/i.exec(message)?.[1]?.trim();
}

function withoutRequestId(message: string): string {
  const match = /\(?\brequest[\s_-]*id\b\s*[:：]\s*([^\s)）]+)\)?/i.exec(message);
  if (!match) {
    return message;
  }
  const before = message.slice(0, match.index).replace(/[（(]\s*$/, '').trimEnd();
  const after = message.slice(match.index + match[0].length).replace(/^\s*[）)]/, '').trimStart();
  return [before, after].filter(Boolean).join(' ').trim() || message;
}

function normalizeProviderPrefix(message: string): string {
  return message.replace(/^(?:provider\s*[:：]\s*)+/i, '').trim();
}

function normalizeDetailMessage(message: string): string {
  return message.replace(/^(?:provider\s*[:：]\s*){2,}/i, 'provider: ').trim();
}

function isProviderProtocolIncompatible(message: string): boolean {
  return /expected io\.reader for image edits mode,\s*got \*ali\.aliimagerequest/i.test(message);
}

function classify(message: string): Pick<ClassifiedRoundError, 'category' | 'primaryAction'> {
  const lower = message.toLowerCase();
  if (isProviderProtocolIncompatible(message)) {
    return { category: 'provider-protocol-incompatible', primaryAction: 'open-provider-settings' };
  }
  if (/\bauth(?:entication|orization)?\b|unauthorized|forbidden|api key|invalid key|token|令牌|401|403/.test(lower)) {
    return { category: 'authentication-failed', primaryAction: 'open-provider-settings' };
  }
  if (/model.+(?:unavailable|not found|does not exist|not available|undiscovered)|unsupported model/.test(lower)) {
    return { category: 'model-unavailable', primaryAction: 'choose-compatible-model' };
  }
  if (/(?:size|preset|aspect ratio).+(?:unsupported|does not support|not support)|does not support preset/.test(lower)) {
    return { category: 'size-unsupported', primaryAction: 'choose-supported-size' };
  }
  if (/image.+(?:read|decode|load|resolve|input).+(?:failed|could not|not ready)|provider input derivative is not ready/.test(lower)) {
    return { category: 'image-input-unreadable', primaryAction: 'replace-image' };
  }
  if (/placement conflict|multiple documents|ambiguous/.test(lower)) {
    return { category: 'placement-conflict', primaryAction: 'fill-composer-from-failed-round' };
  }
  if (/temporarily unavailable|try again|timeout|timed out|network|rate limit|429|502|503|504/.test(lower)) {
    return { category: 'provider-temporarily-unavailable', primaryAction: 'fill-composer-from-failed-round' };
  }
  return { category: 'unknown', primaryAction: 'copy-error-details' };
}

/** 将失败 round 文案折叠为可行动分类，原始 detail 留给次级区域。 */
export function classifyRoundError(errorMessage: string | undefined): ClassifiedRoundError {
  const raw = errorMessage?.trim() ?? '';
  const fallback = raw || 'Job failed.';
  const requestId = requestIdFrom(fallback);
  const cleaned = normalizeProviderPrefix(withoutRequestId(fallback));
  const action = classify(cleaned);
  return {
    ...action,
    message: cleaned || fallback,
    ...(cleaned !== fallback ? { detail: normalizeDetailMessage(fallback) } : {}),
    ...(requestId ? { requestId } : {}),
  };
}
