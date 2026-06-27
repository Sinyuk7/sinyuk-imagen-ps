import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  expectFailureJson,
  expectSuccess,
  realHome,
  runImagen,
  saveProfile,
  tempDir,
} from './harness.js';

describe('CLI basic contract', () => {
  it('prints human help on stdout', () => {
    const res = runImagen(['--help']);
    expect(res.status).toBe(0);
    expect(res.stderr).toBe('');
    expect(res.stdout).toContain('Usage: imagen');
    expect(res.stdout).toContain('provider');
    expect(res.stdout).toContain('profile');
    expect(res.stdout).toContain('job');
    expect(res.stdout).toContain('generate');
    expect(res.stdout).toContain('edit');
    expect(res.stdout).toContain('init');
  });

  it('returns JSON stderr for parser-level failures and removed duplicate commands', () => {
    const unknown = expectFailureJson(runImagen(['no-such-command']));
    expect(unknown.error).toContain('unknown command');

    const missingArg = expectFailureJson(runImagen(['profile', 'get']));
    expect(missingArg.error).toContain('missing required argument');

    for (const removed of [
      ['profile', 'create'],
      ['profile', 'enable', 'mock-dev'],
      ['profile', 'disable', 'mock-dev'],
      ['profile', 'set-default-model', 'mock-dev', 'mock-image-v1'],
    ]) {
      const failed = expectFailureJson(runImagen(removed));
      expect(failed.error).toContain('unknown command');
    }
  });

  it('lists and describes providers', () => {
    const providers = expectSuccess(runImagen(['provider', 'list'], { configDir: tempDir('config') }));
    const ids = providers.map((provider: { id: string }) => provider.id);
    expect(ids).toEqual(['mock', 'image-endpoint', 'chat-image', 'prompt-optimize']);

    const mock = expectSuccess(runImagen(['provider', 'describe', 'mock'], { configDir: tempDir('config') }));
    expect(mock).toMatchObject({
      id: 'mock',
      family: 'image-endpoint',
      operations: ['text_to_image', 'image_edit'],
      defaultModels: [{ id: 'mock-image-v1' }],
    });

    const unknown = expectFailureJson(runImagen(['provider', 'describe', 'unknown'], { configDir: tempDir('config') }));
    expect(unknown.error).toBe('Provider not found: unknown');
  });

  it('keeps config directories isolated through IMAGEN_CONFIG_DIR', () => {
    const dirA = tempDir('config-a');
    const dirB = tempDir('config-b');
    saveProfile(dirA, 'profile-a');

    expect(expectSuccess(runImagen(['profile', 'list'], { configDir: dirA })).profiles).toHaveLength(1);
    expect(expectSuccess(runImagen(['profile', 'list'], { configDir: dirB })).profiles).toEqual([]);
    expect(fs.existsSync(path.join(realHome, '.imagen-ps'))).toBe(false);

    const envDir = tempDir('config-env');
    saveProfile(envDir, 'env-profile');
    const envList = expectSuccess(runImagen(['profile', 'list'], { env: { IMAGEN_CONFIG_DIR: envDir } }));
    expect(envList.profiles.map((profile: { profileId: string }) => profile.profileId)).toEqual(['env-profile']);

    const removedFlag = expectFailureJson(runImagen(['--config-dir', tempDir('config-flag'), 'profile', 'list']));
    expect(removedFlag.error).toContain("unknown option '--config-dir'");
  });
});
