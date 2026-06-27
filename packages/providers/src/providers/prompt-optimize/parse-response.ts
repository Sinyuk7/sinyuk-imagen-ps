import { mapInvalidResponseError } from '../../transport/image-endpoint/error-map.js';

interface PromptOptimizeChoice {
  readonly message?: {
    readonly content?: unknown;
  };
}

interface PromptOptimizeResponse {
  readonly choices?: readonly PromptOptimizeChoice[];
}

function extractContent(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'object' && part !== null && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('')
      .trim();
  }
  return '';
}

export function parsePromptOptimizeResponse(raw: unknown): string {
  if (typeof raw !== 'object' || raw === null) {
    throw mapInvalidResponseError('Prompt optimize response is not a JSON object.', { raw });
  }

  const response = raw as PromptOptimizeResponse;
  if (!Array.isArray(response.choices)) {
    throw mapInvalidResponseError('Prompt optimize response missing "choices" array.', { raw });
  }

  for (const choice of response.choices) {
    if (typeof choice !== 'object' || choice === null) {
      continue;
    }
    const content = extractContent(choice.message?.content);
    if (content.length > 0) {
      return content;
    }
  }

  throw mapInvalidResponseError('Prompt optimize response did not contain any text content.', { raw });
}
