import { describe, expect, it } from 'vitest';
import { createLogger, createMemorySink } from './index.js';
import type { LogRecord } from './types.js';

describe('createLogger', () => {
  it('writes a well-formed record with fixed fields', () => {
    const sink = createMemorySink();
    const logger = createLogger({
      sink,
      context: { surface: 'test', package: 'foundation', component: 'sink' },
      traceId: 'tr_fixed',
      now: () => '2026-01-01T00:00:00.000Z',
    });

    logger.info('test.event', { key: 'value' });

    expect(sink.records).toHaveLength(1);
    const record = sink.records[0] as LogRecord;
    expect(record.schema_version).toBe(1);
    expect(record.timestamp).toBe('2026-01-01T00:00:00.000Z');
    expect(record.level).toBe('info');
    expect(record.event).toBe('test.event');
    expect(record.surface).toBe('test');
    expect(record.package).toBe('foundation');
    expect(record.component).toBe('sink');
    expect(record.trace_id).toBe('tr_fixed');
    expect(record.span_id).toMatch(/^sp_/);
    expect(record.attrs).toEqual({ key: 'value' });
  });

  it('child logger merges context and inherits trace_id', () => {
    const sink = createMemorySink();
    const parent = createLogger({
      sink,
      context: { surface: 'test', package: 'foundation', component: 'sink', trace_id: 'tr_parent' },
    });
    const child = parent.child({ component: 'runner', job_id: 'job-1' });

    child.info('child.event');

    const record = sink.records[0];
    expect(record.trace_id).toBe('tr_parent');
    expect(record.component).toBe('runner');
    expect(record.job_id).toBe('job-1');
    expect(record.surface).toBe('test');
  });

  it('redacts secrets in attrs', () => {
    const sink = createMemorySink();
    const logger = createLogger({ sink, context: { surface: 'test' } });

    logger.info('event', { apiKey: 'secret', prompt: 'ok' });

    expect(sink.records[0].attrs).toEqual({ apiKey: '[REDACTED]', prompt: 'ok' });
  });
});

describe('LogSpan', () => {
  it('emits start / ok pair with duration_ms and parent_span_id', () => {
    const sink = createMemorySink();
    const logger = createLogger({
      sink,
      context: { surface: 'test', trace_id: 'tr_span' },
    });

    const span = logger.startSpan('runner.step');
    span.finish();

    expect(sink.records).toHaveLength(2);
    const [start, finish] = sink.records;
    expect(start.event).toBe('runner.step.start');
    expect(start.status).toBe('start');
    expect(start.parent_span_id).toBeUndefined();

    expect(finish.event).toBe('runner.step.ok');
    expect(finish.status).toBe('ok');
    expect(finish.span_id).toBe(start.span_id);
    expect(finish.parent_span_id).toBe(start.parent_span_id);
    expect(finish.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('emits start / fail pair with error and duration_ms', () => {
    const sink = createMemorySink();
    const logger = createLogger({ sink, context: { surface: 'test' } });

    const span = logger.startSpan('dispatch.provider');
    span.fail({ message: 'boom', category: 'provider' });

    expect(sink.records).toHaveLength(2);
    const finish = sink.records[1];
    expect(finish.event).toBe('dispatch.provider.fail');
    expect(finish.status).toBe('fail');
    expect(finish.error).toEqual({ message: 'boom', category: 'provider' });
  });
});

describe('logger fail-open', () => {
  it('does not throw when sink throws', () => {
    const logger = createLogger({
      sink: {
        write() {
          throw new Error('sink broken');
        },
      },
    });

    expect(() => logger.info('event')).not.toThrow();
  });
});
