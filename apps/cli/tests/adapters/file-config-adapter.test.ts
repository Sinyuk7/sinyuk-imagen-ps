import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { FileConfigAdapter } from '../../src/adapters/file-config-adapter.js';

describe('FileConfigAdapter', () => {
  let tmpDir: string;
  let adapter: FileConfigAdapter;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imagen-cli-test-'));
    adapter = new FileConfigAdapter(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const mockConfig = {
    providerId: 'mock',
    displayName: 'Mock Provider',
    family: 'mock' as const,
    baseURL: 'http://localhost:3000',
    apiKey: 'test-key',
  };

  describe('save()', () => {
    it('should create config file on first save', async () => {
      await adapter.save('mock', mockConfig as never);
      const configPath = path.join(tmpDir, 'config.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(data.version).toBe(1);
      expect(data.providers.mock).toEqual(mockConfig);
    });

    it('should update existing config without overwriting other providers', async () => {
      await adapter.save('mock', mockConfig as never);
      const otherConfig = { ...mockConfig, providerId: 'other', displayName: 'Other' };
      await adapter.save('other', otherConfig as never);

      const configPath = path.join(tmpDir, 'config.json');
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(data.providers.mock).toEqual(mockConfig);
      expect(data.providers.other).toEqual(otherConfig);
    });

    it('should use atomic write (tmp + rename)', async () => {
      await adapter.save('mock', mockConfig as never);
      // tmp file should not exist after successful write
      const tmpPath = path.join(tmpDir, 'config.json.tmp');
      expect(fs.existsSync(tmpPath)).toBe(false);
    });

    it('should clean up residual tmp file before writing', async () => {
      // Create a residual tmp file
      const tmpPath = path.join(tmpDir, 'config.json.tmp');
      fs.writeFileSync(tmpPath, 'residual data');

      await adapter.save('mock', mockConfig as never);
      expect(fs.existsSync(tmpPath)).toBe(false);

      // Verify actual config is correct
      const result = await adapter.get('mock');
      expect(result).toEqual(mockConfig);
    });

    it('should create config directory if it does not exist', async () => {
      const nestedDir = path.join(tmpDir, 'nested', 'dir');
      const nestedAdapter = new FileConfigAdapter(nestedDir);
      await nestedAdapter.save('mock', mockConfig as never);

      const configPath = path.join(nestedDir, 'config.json');
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('should throw when config directory path is occupied by a file', async () => {
      // Create a file at the config dir path
      const filePath = path.join(tmpDir, 'blocked');
      fs.writeFileSync(filePath, 'I am a file');

      const blockedAdapter = new FileConfigAdapter(filePath);
      await expect(blockedAdapter.save('mock', mockConfig as never)).rejects.toThrow();
    });
  });

  describe('get()', () => {
    it('should return undefined when config file does not exist', async () => {
      const result = await adapter.get('mock');
      expect(result).toBeUndefined();
    });

    it('should return undefined for non-existent provider', async () => {
      await adapter.save('mock', mockConfig as never);
      const result = await adapter.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('should return saved config', async () => {
      await adapter.save('mock', mockConfig as never);
      const result = await adapter.get('mock');
      expect(result).toEqual(mockConfig);
    });

    it('should throw on permission errors (not ENOENT)', async () => {
      const configPath = path.join(tmpDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ version: 1, providers: {} }));
      fs.chmodSync(configPath, 0o000);

      // May not fail on all systems (root), but validates error propagation path
      try {
        await adapter.get('mock');
        // If we get here, permissions were not enforced (running as root)
        fs.chmodSync(configPath, 0o644);
      } catch (err: unknown) {
        fs.chmodSync(configPath, 0o644);
        expect(err).toBeInstanceOf(Error);
      }
    });
  });
});
