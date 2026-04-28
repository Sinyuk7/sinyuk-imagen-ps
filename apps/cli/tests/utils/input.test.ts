import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseJsonInput } from '../../src/utils/input.js';

describe('parseJsonInput', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imagen-cli-input-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should parse a JSON string directly', () => {
    const result = parseJsonInput('{"key":"value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('should parse a JSON array', () => {
    const result = parseJsonInput('[1, 2, 3]');
    expect(result).toEqual([1, 2, 3]);
  });

  it('should read and parse a @file reference', () => {
    const filePath = path.join(tmpDir, 'test.json');
    fs.writeFileSync(filePath, '{"fromFile": true}');

    const result = parseJsonInput(`@${filePath}`);
    expect(result).toEqual({ fromFile: true });
  });

  it('should throw on invalid JSON string', () => {
    expect(() => parseJsonInput('{invalid}')).toThrow(/Invalid JSON/);
  });

  it('should throw on non-existent @file', () => {
    expect(() => parseJsonInput('@/nonexistent/file.json')).toThrow(/Failed to read file/);
  });

  it('should throw on @file with invalid JSON content', () => {
    const filePath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(filePath, 'not json at all');

    expect(() => parseJsonInput(`@${filePath}`)).toThrow(/Invalid JSON/);
  });
});
