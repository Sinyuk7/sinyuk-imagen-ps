import { describe, expect, it } from 'vitest';
import {
  assembleApiUrl,
  canonicalizeProviderBaseUrl,
  classifyEndpoint,
  implementationIdForApiFormat,
  normalizeApiFormatPaths,
} from '../src/index.js';

describe('API format endpoint classification', () => {
  it('classifies supported full URLs and splits base URL from protocol path', () => {
    expect(classifyEndpoint('https://foo.com/openai/v1/chat/completions')).toEqual({
      status: 'supported',
      apiFormat: 'openai-chat-completions',
      source: 'full-url',
      baseUrl: 'https://foo.com/openai/v1',
      paths: { invoke: '/chat/completions' },
    });
    expect(classifyEndpoint('https://foo.com/proxy/v1/images/generations')).toEqual({
      status: 'supported',
      apiFormat: 'openai-images',
      source: 'full-url',
      baseUrl: 'https://foo.com/proxy/v1',
      paths: { generation: '/images/generations' },
    });
    expect(classifyEndpoint('https://llm-api.net/v1beta/models/gemini-2.5-flash-image:generateContent')).toEqual({
      status: 'supported',
      apiFormat: 'gemini-generate-content',
      source: 'full-url',
      baseUrl: 'https://llm-api.net/v1beta',
      paths: { invokeTemplate: '/models/{model}:generateContent' },
      extractedModel: 'gemini-2.5-flash-image',
    });
  });

  it('classifies supported paths and Gemini templates', () => {
    expect(classifyEndpoint('/chat/completions')).toMatchObject({
      status: 'supported',
      apiFormat: 'openai-chat-completions',
      source: 'path',
      paths: { invoke: '/chat/completions' },
    });
    expect(classifyEndpoint('/models/{model}:generateContent')).toMatchObject({
      status: 'supported',
      apiFormat: 'gemini-generate-content',
      paths: { invokeTemplate: '/models/{model}:generateContent' },
    });
    expect(classifyEndpoint('/models/%7Bmodel%7D:generateContent')).toMatchObject({
      status: 'supported',
      apiFormat: 'gemini-generate-content',
      paths: { invokeTemplate: '/models/{model}:generateContent' },
    });
  });

  it('marks edit-only OpenAI Images paths incomplete', () => {
    expect(classifyEndpoint('/images/edits')).toEqual({
      status: 'incomplete',
      apiFormat: 'openai-images',
      source: 'path',
      paths: { edit: '/images/edits' },
      reason: 'missing-generation-path',
    });
  });

  it('rejects unsupported and unsafe inputs without guessing', () => {
    expect(classifyEndpoint('ftp://example.com/chat/completions')).toEqual({
      status: 'unsupported',
      reason: 'unsupported-scheme',
    });
    expect(classifyEndpoint('https://example.com/chat/completions?x=1')).toEqual({
      status: 'unsupported',
      source: 'full-url',
      reason: 'unsupported-query',
    });
    expect(classifyEndpoint('/Chat/Completions')).toEqual({
      status: 'unsupported',
      source: 'path',
      reason: 'unrecognized-path',
    });
    expect(classifyEndpoint('/chat/completions/status')).toEqual({
      status: 'unsupported',
      source: 'path',
      reason: 'unrecognized-path',
    });
    expect(classifyEndpoint('/chat/completions-backup')).toEqual({
      status: 'unsupported',
      source: 'path',
      reason: 'unrecognized-path',
    });
  });
});

describe('API format URL safety', () => {
  it('preserves base URL prefixes during assembly', () => {
    expect(assembleApiUrl('https://foo.com/openai/v1', '/chat/completions')).toBe(
      'https://foo.com/openai/v1/chat/completions',
    );
    expect(assembleApiUrl('https://foo.com/openai/v1/', 'chat/completions')).toBe(
      'https://foo.com/openai/v1/chat/completions',
    );
    expect(assembleApiUrl('https://foo.com', '/images/generations')).toBe(
      'https://foo.com/images/generations',
    );
  });

  it('rejects unsafe base URLs and paths', () => {
    expect(() => canonicalizeProviderBaseUrl('https://user:pass@example.com')).toThrow(/credentials/);
    expect(() => canonicalizeProviderBaseUrl('https://example.com/base?x=1')).toThrow(/query/);
    expect(() => canonicalizeProviderBaseUrl('https://example.com/base#hash')).toThrow(/fragments/);
    expect(canonicalizeProviderBaseUrl('https://example.com/a/../b')).toBe('https://example.com/b');
    expect(() => canonicalizeProviderBaseUrl('https://example.com\\bad')).toThrow(/backslashes/);
    expect(() => normalizeApiFormatPaths('openai-chat-completions', { invoke: '../chat/completions' })).toThrow(/dot segments/);
    expect(() => normalizeApiFormatPaths('openai-images', { generation: '/images\\generations' })).toThrow(/backslashes/);
  });

  it('maps API formats to internal implementation IDs', () => {
    expect(implementationIdForApiFormat('openai-images')).toBe('image-endpoint');
    expect(implementationIdForApiFormat('openai-chat-completions')).toBe('chat-image');
    expect(implementationIdForApiFormat('gemini-generate-content')).toBe('gemini-generate-content');
  });
});
