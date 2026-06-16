import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertNoSentinel,
  expectFailureJson,
  expectSuccess,
  mkdirp,
  mockProfile,
  readProfile,
  runImagen,
  saveProfile,
  sentinel,
  tempDir,
  writeJson,
} from './harness.js';

describe('CLI profile contract', () => {
  it('saves a new profile, reads it, lists it, and deletes it without leaking secret values', () => {
    const configDir = tempDir('config-profile-new');
    const initial = saveProfile(configDir, 'mock-dev');
    expect(initial).toMatchObject({
      profileId: 'mock-dev',
      providerId: 'mock',
      displayName: 'Mock Dev',
      enabled: true,
    });
    expect(initial.secretRefs).toEqual({ apiKey: 'secret:provider-profile:mock-dev:apiKey' });
    assertNoSentinel(JSON.stringify(initial));

    const listed = expectSuccess(runImagen(['profile', 'list'], { configDir }));
    expect(listed.profiles).toHaveLength(1);
    assertNoSentinel(JSON.stringify(listed));

    expectSuccess(runImagen(['profile', 'delete', 'mock-dev'], { configDir }));
    expect(expectSuccess(runImagen(['profile', 'list'], { configDir })).profiles).toEqual([]);
    expectFailureJson(runImagen(['profile', 'get', 'mock-dev'], { configDir }));
  });

  it('uses profile save as the only update path for profile fields and enabled state', () => {
    const configDir = tempDir('config-profile-update');
    const initial = saveProfile(configDir, 'mock-dev');
    const updatePath = writeJson(
      tempDir('fixtures-update'),
      'mock-dev-update.json',
      {
        profileId: 'mock-dev',
        displayName: 'Mock Updated',
        enabled: false,
        config: {
          baseURL: 'https://mock.example.test',
        },
      },
    );

    const updated = expectSuccess(runImagen(['profile', 'save', `@${updatePath}`], { configDir })).profile;
    expect(updated.displayName).toBe('Mock Updated');
    expect(updated.config.baseURL).toBe('https://mock.example.test');
    expect(updated.config.defaultModel).toBe(initial.config.defaultModel);
    expect(updated.enabled).toBe(false);
    expect(updated.secretRefs).toEqual(initial.secretRefs);
    expect(updated.createdAt).toBe(initial.createdAt);
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(initial.createdAt));
    assertNoSentinel(JSON.stringify(updated));

    const testResult = expectSuccess(runImagen(['profile', 'test', 'mock-dev'], { configDir })).result;
    expect(testResult.valid).toBe(true);
  });

  it('rejects duplicate profile aliases even when profileIds differ', () => {
    const configDir = tempDir('config-profile-alias-unique');
    saveProfile(configDir, 'mock-dev', { displayName: 'Relay A' });
    const duplicatePath = writeJson(tempDir('fixtures-alias'), 'alias.json', mockProfile('mock-dev-2', {
      displayName: 'Relay A',
      config: {
        baseURL: 'https://mock.local',
        defaultModel: 'mock-image-v1',
      },
    }));

    const failed = expectFailureJson(runImagen(['profile', 'save', `@${duplicatePath}`], { configDir }));
    expect(failed.error).toContain('displayName "Relay A" already exists');
    expect(expectSuccess(runImagen(['profile', 'list'], { configDir })).profiles).toHaveLength(1);
  });

  it('rejects providerId conflicts for an existing profileId without changing the old profile', () => {
    const configDir = tempDir('config-profile-conflict');
    saveProfile(configDir, 'mock-dev');
    const before = readProfile(configDir, 'mock-dev');
    const conflictPath = writeJson(tempDir('fixtures-conflict'), 'conflict.json', {
      profileId: 'mock-dev',
      providerId: 'chat-image',
      displayName: 'Conflicting Provider',
      config: {
        providerId: 'chat-image',
        family: 'chat-image',
        displayName: 'Conflicting Provider',
        baseURL: 'https://example.test/api',
        defaultModel: 'chat-image-model',
      },
      secretValues: { apiKey: sentinel },
    });

    const failed = expectFailureJson(runImagen(['profile', 'save', `@${conflictPath}`], { configDir }));
    expect(failed.error).toContain('already uses provider "mock"');
    expect(readProfile(configDir, 'mock-dev')).toEqual(before);
    assertNoSentinel(JSON.stringify(failed));
  });

  it('does not corrupt an existing profile or secret when save validation fails', () => {
    const configDir = tempDir('config-invalid-update');
    saveProfile(configDir, 'mock-dev');
    const before = readProfile(configDir, 'mock-dev');
    const invalidPath = writeJson(
      tempDir('fixtures-invalid'),
      'invalid.json',
      mockProfile('mock-dev', {
        displayName: 'Broken Update',
        config: { baseURL: 'not-a-url' },
        secretValues: { apiKey: 'SHOULD_ROLL_BACK' },
      }),
    );

    const failed = expectFailureJson(runImagen(['profile', 'save', `@${invalidPath}`], { configDir }));
    expect(failed.error).toContain('validation failed');
    expect(readProfile(configDir, 'mock-dev')).toEqual(before);

    const testResult = expectSuccess(runImagen(['profile', 'test', 'mock-dev'], { configDir })).result;
    expect(testResult.valid).toBe(true);
  });

  it('validates profile test, model list, unsupported discovery, malformed JSON, and missing file paths', () => {
    const configDir = tempDir('config-errors');
    saveProfile(configDir, 'mock-dev');

    const testResult = expectSuccess(runImagen(['profile', 'test', 'mock-dev'], { configDir })).result;
    expect(testResult).toMatchObject({
      profileId: 'mock-dev',
      providerId: 'mock',
      valid: true,
    });
    expect(testResult.connectivity).toBeUndefined();

    const models = expectSuccess(runImagen(['profile', 'models', 'mock-dev'], { configDir })).models;
    expect(models).toEqual([{ id: 'mock-image-v1' }]);

    const refresh = expectFailureJson(runImagen(['profile', 'refresh-models', 'mock-dev'], { configDir }));
    expect(refresh.error).toContain('does not support model discovery');

    const fixtureDir = tempDir('fixtures-errors');
    const badJson = path.join(fixtureDir, 'bad.json');
    mkdirp(fixtureDir);
    fs.writeFileSync(badJson, `{ "secretValues": { "apiKey": "${sentinel}" }`, 'utf-8');

    const malformed = expectFailureJson(runImagen(['profile', 'save', `@${badJson}`], { configDir }));
    expect(malformed.error).toContain('Invalid JSON');
    assertNoSentinel(JSON.stringify(malformed));

    const missingProfileId = expectFailureJson(
      runImagen(['profile', 'save', JSON.stringify({ providerId: 'mock' })], { configDir }),
    );
    expect(missingProfileId.error).toContain('requires profileId');

    const missing = expectFailureJson(runImagen(['profile', 'save', `@${path.join(fixtureDir, 'missing.json')}`], { configDir }));
    expect(missing.error).toContain('Failed to read file');
  });
});
