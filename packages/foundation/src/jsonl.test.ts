import { describe, expect, it } from 'vitest';
import { decodeLogRecords, encodeLogRecord, encodeLogRecords } from './jsonl.js';
import type { LogRecord } from './types.js';

const fixture: LogRecord = {
  schema_version: 1,
  timestamp: '2026-01-01T00:00:00.000Z',
  level: 'info',
  event: 'test.event',
  surface: 'test',
  package: 'foundation',
  component: 'sink',
  trace_id: 'tr_1',
  span_id: 'sp_1',
};

describe('encodeLogRecord', () => {
  it('returns compact JSON without newlines', () => {
    const encoded = encodeLogRecord(fixture);
    expect(encoded).toContain('"event":"test.event"');
    expect(encoded).not.toContain('\n');
  });
});

describe('encodeLogRecords', () => {
  it('joins records with newlines', () => {
    const encoded = encodeLogRecords([fixture, fixture]);
    expect(encoded.split('\n')).toHaveLength(2);
  });
});

describe('decodeLogRecords', () => {
  it('decodes JSONL text and skips empty lines', () => {
    const encoded = encodeLogRecords([fixture, fixture]);
    const decoded = decodeLogRecords(`${encoded}\n\n`);
    expect(decoded).toHaveLength(2);
    expect(decoded[0]).toEqual(fixture);
  });
});
