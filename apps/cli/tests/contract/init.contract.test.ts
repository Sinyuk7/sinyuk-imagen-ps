import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expectFailureJson, expectSuccess, realHome, runImagen, tempDir } from './harness.js';

describe('CLI init contract', () => {
  it('creates a mock profile only inside the CLI config dir', () => {
    const configDir = tempDir('config-init-mock');
    const outDir = tempDir('out-init-mock');

    const init = expectSuccess(runImagen(['init', '--mock'], { configDir }));
    expect(init).toMatchObject({
      profile: {
        profileId: 'mock-dev',
        providerId: 'mock',
        displayName: 'Mock Dev',
        enabled: true,
      },
    });

    const profileFile = path.join(configDir, 'provider-profiles.json');
    const secretsFile = path.join(configDir, 'provider-secrets.json');
    expect(fs.existsSync(profileFile)).toBe(true);
    expect(fs.existsSync(secretsFile)).toBe(true);
    expect(fs.existsSync(path.join(realHome, '.imagen-ps'))).toBe(false);

    const profile = expectSuccess(runImagen(['profile', 'get', 'mock-dev'], { configDir })).profile;
    expect(profile.secretRefs).toEqual({ apiKey: 'secret:provider-profile:mock-dev:apiKey' });

    const job = expectSuccess(
      runImagen(
        [
          'generate',
          '--profile',
          'mock-dev',
          '--prompt',
          'simple blue square icon on a plain white background',
          '--out',
          outDir,
        ],
        { configDir },
      ),
    );
    expect(job.status).toBe('completed');
    expect(job.savedImages).toHaveLength(1);
  });

  it('keeps init scoped to the explicit mock mode', () => {
    const failed = expectFailureJson(runImagen(['init'], { configDir: tempDir('config-init-required') }));
    expect(failed.error).toContain("required option '--mock'");
  });
});
