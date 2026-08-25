import { describe, expect, it } from 'vitest';
import {
  apiFormatForImplementationId,
  classifyEndpoint,
  defaultPathsForApiFormat,
  implementationIdForApiFormat,
  normalizeApiFormatPaths,
} from '../src/index.js';

describe('GRSAI API format', () => {
  it('normalizes submit and result paths independently', () => {
    expect(defaultPathsForApiFormat('grsai')).toEqual({
      submit: '/v1/api/generate',
      result: '/v1/api/result',
    });
    expect(normalizeApiFormatPaths('grsai', {
      submit: ' gateway/v1/api/generate/ ',
      result: '/gateway/v1/api/result/',
    })).toEqual({
      submit: '/gateway/v1/api/generate',
      result: '/gateway/v1/api/result',
    });
    expect(() => normalizeApiFormatPaths('grsai', { submit: '/v1/api/generate?x=1' })).toThrow(/query strings or fragments/);
    expect(() => normalizeApiFormatPaths('grsai', { result: '/v1/api/result#part' })).toThrow(/query strings or fragments/);
  });

  it('classifies only exact GRSAI submission endpoints', () => {
    expect(classifyEndpoint('https://grsaiapi.com/v1/api/generate')).toEqual({
      status: 'supported',
      apiFormat: 'grsai',
      source: 'full-url',
      baseUrl: 'https://grsaiapi.com/',
      paths: { submit: '/v1/api/generate', result: '/v1/api/result' },
    });
    expect(classifyEndpoint('https://grsai.dakka.com.cn/v1/api/generate')).toMatchObject({
      status: 'supported',
      apiFormat: 'grsai',
      baseUrl: 'https://grsai.dakka.com.cn/',
    });
    expect(classifyEndpoint('https://proxy.example.com/grsai/v1/api/generate')).toMatchObject({
      status: 'supported',
      apiFormat: 'grsai',
      baseUrl: 'https://proxy.example.com/grsai',
    });
    expect(classifyEndpoint('/v1/api/generate')).toEqual({
      status: 'supported',
      apiFormat: 'grsai',
      source: 'path',
      paths: { submit: '/v1/api/generate', result: '/v1/api/result' },
    });
    expect(classifyEndpoint('https://grsaiapi.com')).toMatchObject({ status: 'unsupported', reason: 'unrecognized-path' });
    expect(classifyEndpoint('https://grsaiapi.com/v1/api/generate?model=x')).toMatchObject({ status: 'unsupported', reason: 'unsupported-query' });
    expect(classifyEndpoint('https://grsaiapi.com/v1/api/generate#result')).toMatchObject({ status: 'unsupported', reason: 'unsupported-fragment' });
  });

  it('uses only reciprocal canonical routing', () => {
    expect(implementationIdForApiFormat('grsai')).toBe('grsai-generate');
    expect(apiFormatForImplementationId('grsai-generate')).toBe('grsai');
    expect(apiFormatForImplementationId(implementationIdForApiFormat('grsai'))).toBe('grsai');
  });
});
