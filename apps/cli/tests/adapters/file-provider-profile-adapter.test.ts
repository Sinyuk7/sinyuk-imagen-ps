import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ProviderProfile } from '@imagen-ps/shared-commands';
import {
  FileProviderProfileRepository,
  FileSecretStorageAdapter,
} from '../../src/adapters/file-provider-profile-adapter.js';

describe('FileProviderProfileRepository', () => {
  let tmpDir: string;
  let repository: FileProviderProfileRepository;

  const profile: ProviderProfile = {
    profileId: 'mock-profile',
    providerId: 'mock',
    family: 'openai-compatible',
    displayName: 'Mock Profile',
    enabled: true,
    config: { baseURL: 'https://mock.local' },
    secretRefs: { apiKey: 'secret:provider-profile:mock-profile:apiKey' },
    createdAt: '2026-04-29T00:00:00.000Z',
    updatedAt: '2026-04-29T00:00:00.000Z',
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imagen-cli-profile-test-'));
    repository = new FileProviderProfileRepository(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists profiles using versioned schema without secret values', async () => {
    await repository.save(profile);

    const profilesPath = path.join(tmpDir, 'provider-profiles.json');
    expect(fs.existsSync(profilesPath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(profilesPath, 'utf-8'));
    expect(data.schemaVersion).toBe(1);
    expect(data.profiles).toEqual([profile]);
    expect(JSON.stringify(data)).not.toContain('secret-key');

    await expect(repository.get('mock-profile')).resolves.toEqual(profile);
    await expect(repository.list()).resolves.toEqual([profile]);
  });

  it('updates existing profiles and deletes by profileId', async () => {
    await repository.save(profile);
    const updated = { ...profile, displayName: 'Updated Mock Profile', updatedAt: '2026-04-29T01:00:00.000Z' };
    await repository.save(updated);

    await expect(repository.list()).resolves.toEqual([updated]);

    await repository.delete('mock-profile');
    await expect(repository.get('mock-profile')).resolves.toBeUndefined();
    await expect(repository.list()).resolves.toEqual([]);
  });

  it('uses atomic write and cleans residual tmp file', async () => {
    fs.writeFileSync(path.join(tmpDir, 'provider-profiles.json.tmp'), 'residual');

    await repository.save(profile);

    expect(fs.existsSync(path.join(tmpDir, 'provider-profiles.json.tmp'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'provider-profiles.json'))).toBe(true);
  });
});

describe('FileSecretStorageAdapter', () => {
  let tmpDir: string;
  let adapter: FileSecretStorageAdapter;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imagen-cli-secret-test-'));
    adapter = new FileSecretStorageAdapter(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists secrets using separate versioned schema', async () => {
    await adapter.setSecret('secret:provider-profile:mock-profile:apiKey', 'secret-key');

    const secretsPath = path.join(tmpDir, 'provider-secrets.json');
    expect(fs.existsSync(secretsPath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));
    expect(data).toEqual({
      schemaVersion: 1,
      secrets: { 'secret:provider-profile:mock-profile:apiKey': 'secret-key' },
    });

    await expect(adapter.getSecret('secret:provider-profile:mock-profile:apiKey')).resolves.toBe('secret-key');
  });

  it('deletes secrets and leaves no residual tmp file', async () => {
    fs.writeFileSync(path.join(tmpDir, 'provider-secrets.json.tmp'), 'residual');

    await adapter.setSecret('secret:provider-profile:mock-profile:apiKey', 'secret-key');
    await adapter.deleteSecret('secret:provider-profile:mock-profile:apiKey');

    expect(fs.existsSync(path.join(tmpDir, 'provider-secrets.json.tmp'))).toBe(false);
    await expect(adapter.getSecret('secret:provider-profile:mock-profile:apiKey')).resolves.toBeUndefined();
  });
});
