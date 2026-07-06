import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '@imagen-ps/foundation';
import { createChatImageProvider } from '../src/providers/chat-image/provider.js';
import { parseChatImageResponse } from '../src/transport/chat-image/parse-response.js';
import { createCountingFetch } from './counting-transport.js';
import { chatImageModel } from './model-execution.js';

function bytesToBase64(bytes: readonly number[]): string {
  return Buffer.from(bytes).toString('base64');
}

function createJpegDataUrl(width: number, height: number): string {
  const bytes = [
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ];
  return `data:image/jpeg;base64,${bytesToBase64(bytes)}`;
}

function createTestLogger(records: Array<{ level: string; event: string; attrs?: Record<string, unknown> }>): Logger {
  const logger: Logger = {
    context: {},
    child(context) {
      records.push({ level: 'child', event: 'child', attrs: context });
      return logger;
    },
    log(level, event, attrs) {
      records.push({ level, event, attrs });
    },
    debug(event, attrs) {
      records.push({ level: 'debug', event, attrs });
    },
    info(event, attrs) {
      records.push({ level: 'info', event, attrs });
    },
    warn(event, attrs) {
      records.push({ level: 'warning', event, attrs });
    },
    error(event, attrs) {
      records.push({ level: 'error', event, attrs });
    },
    startSpan(operation, attrs) {
      records.push({ level: 'span-start', event: operation, attrs });
      return {
        span_id: 'span-test',
        trace_id: 'trace-test',
        finish(finishAttrs) {
          records.push({ level: 'span-finish', event: operation, attrs: finishAttrs });
        },
        fail(error, failAttrs) {
          records.push({
            level: 'span-fail',
            event: operation,
            attrs: {
              ...(failAttrs ?? {}),
              error: error instanceof Error ? error.message : String(error),
            },
          });
        },
      };
    },
  };
  return logger;
}

const provider = createChatImageProvider();

const baseConfig = {
  providerId: 'chat-image',
  displayName: 'Chat Image',
  family: 'chat-image' as const,
  apiFormat: 'openai-chat-completions' as const,
  connection: {
    selectionMode: 'manual' as const,
    selectedEndpointId: 'primary',
    endpoints: [{ id: 'primary', url: 'https://example.test/v1', enabled: true }],
  },
  paths: { invoke: '/chat/completions' },
  apiKey: 'test-key',
  timeoutMs: 1000,
};

const mismatchRequest = {
  operation: 'text_to_image' as const,
  prompt: 'Create an illustration of a girl with pink hair',
  output: {
    selection: {
      geometry: {
        kind: 'ratio-resolution' as const,
        aspectRatio: '1:1' as const,
        resolution: '1k' as const,
      },
      outputFormat: 'png' as const,
    },
  },
  capabilityModelId: 'gemini-3.1-flash-image',
  model: chatImageModel('gemini-3.1-flash-image'),
};

describe('chat-image output contract validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parser records output facts and contract violations for inline image bytes', () => {
    const response = {
      choices: [{
        message: {
          images: [{ image_url: { url: createJpegDataUrl(4, 2) } }],
          content: '',
        },
      }],
    };

    const parsed = parseChatImageResponse(response, mismatchRequest);

    expect(parsed.assetSummaries).toHaveLength(1);
    expect(parsed.assetSummaries?.[0]).toMatchObject({
      mimeType: 'image/jpeg',
      outputFacts: {
        width: 4,
        height: 2,
        mimeType: 'image/jpeg',
      },
      contractViolations: [
        {
          kind: 'output-format-mismatch',
          expected: 'image/png',
          actual: 'image/jpeg',
        },
        {
          kind: 'aspect-ratio-mismatch',
          expected: '1:1',
          actualWidth: 4,
          actualHeight: 2,
        },
      ],
    });
    expect(parsed.diagnostics?.map((item) => item.code)).toEqual([
      'chat-image.response.output-format-mismatch',
      'chat-image.response.aspect-ratio-mismatch',
    ]);
    expect(parsed.contractViolations).toHaveLength(2);
  });

  it('provider surfaces mismatch diagnostics and warning logs', async () => {
    const fetchProgram = createCountingFetch([
      {
        kind: 'response',
        data: {
          choices: [{
            message: {
              images: [{ image_url: { url: createJpegDataUrl(4, 2) } }],
              content: '',
            },
          }],
        },
      },
    ]);
    vi.stubGlobal('fetch', fetchProgram.fetch);
    const records: Array<{ level: string; event: string; attrs?: Record<string, unknown> }> = [];

    const result = await provider.invoke({
      config: baseConfig,
      request: mismatchRequest,
      logger: createTestLogger(records),
    });

    expect(result.assets).toHaveLength(1);
    expect(result.diagnostics?.map((item) => item.code)).toEqual(expect.arrayContaining([
      'chat-image.response.output-format-mismatch',
      'chat-image.response.aspect-ratio-mismatch',
    ]));
    expect(records.filter((item) => item.event === 'provider.chat_image.response_contract_violation')).toHaveLength(2);
  });
});
