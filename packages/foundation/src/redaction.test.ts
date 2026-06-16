import { describe, expect, it } from 'vitest';
import { redactAttrs, redactValue } from './redaction.js';

describe('redactValue', () => {
  it('keeps plain strings and numbers', () => {
    expect(redactValue('hello')).toBe('hello');
    expect(redactValue(42)).toBe(42);
    expect(redactValue(true)).toBe(true);
  });

  it('redacts Bearer tokens', () => {
    expect(redactValue('Bearer sk-1234567890abcdef')).toBe('[REDACTED_SECRET]');
  });

  it('redacts absolute macOS paths', () => {
    expect(redactValue('/Users/sinyuk/.imagen-ps/profile.json')).toBe('[REDACTED_PATH]');
  });

  it('redacts Windows absolute paths', () => {
    expect(redactValue('C:\\Users\\sinyuk\\file.txt')).toBe('[REDACTED_PATH]');
  });

  it('redacts forbidden top-level keys', () => {
    const input = {
      prompt: 'a cat',
      apiKey: 'secret-value',
      headers: { Authorization: 'Bearer x' },
      raw: { data: 'big' },
    };
    expect(redactValue(input)).toEqual({
      prompt: 'a cat',
      apiKey: '[REDACTED]',
      headers: '[REDACTED]',
      raw: '[REDACTED]',
    });
  });

  it('redacts secret-like keys recursively', () => {
    const input = {
      nested: {
        mySecretToken: 'hidden',
        safe: 'visible',
      },
    };
    expect(redactValue(input)).toEqual({
      nested: {
        mySecretToken: '[REDACTED]',
        safe: 'visible',
      },
    });
  });

  it('redacts arrays', () => {
    expect(redactValue(['Bearer a', 'Bearer b'])).toEqual(['[REDACTED_SECRET]', '[REDACTED_SECRET]']);
  });
});

describe('redactAttrs', () => {
  it('returns undefined for undefined input', () => {
    expect(redactAttrs(undefined)).toBeUndefined();
  });

  it('returns a new object without mutating the original', () => {
    const original = { apiKey: 'secret' };
    const redacted = redactAttrs(original);
    expect(redacted).toEqual({ apiKey: '[REDACTED]' });
    expect(original).toEqual({ apiKey: 'secret' });
  });
});
