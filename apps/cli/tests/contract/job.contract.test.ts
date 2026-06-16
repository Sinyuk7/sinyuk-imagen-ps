import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertNoSentinel,
  expectFailureJson,
  expectSuccess,
  runImagen,
  saveProfile,
  tempDir,
  writeJson,
} from './harness.js';

describe('CLI job contract', () => {
  it('submits mock generation jobs and writes per-job artifacts without overwriting', () => {
    const configDir = tempDir('config-job');
    const outDir = tempDir('out');
    saveProfile(configDir, 'mock-dev');
    const inputPath = writeJson(tempDir('fixtures-job'), 'input.json', {
      profileId: 'mock-dev',
      prompt: 'simple blue square icon on a plain white background',
      output: { count: 1 },
    });

    const first = expectSuccess(runImagen(['job', 'submit', 'provider-generate', `@${inputPath}`], { configDir }));
    expect(first.status).toBe('completed');
    expect(first.savedImages).toBeUndefined();
    assertNoSentinel(JSON.stringify(first));

    const withOutA = expectSuccess(
      runImagen(['job', 'submit', 'provider-generate', `@${inputPath}`, '--out', outDir], { configDir }),
    );
    const withOutB = expectSuccess(
      runImagen(['job', 'submit', 'provider-generate', `@${inputPath}`, '--out', outDir], { configDir }),
    );

    expect(withOutA.status).toBe('completed');
    expect(withOutB.status).toBe('completed');
    expect(withOutA.id).not.toBe(withOutB.id);
    expect(withOutA.savedImages).toHaveLength(1);
    expect(withOutB.savedImages).toHaveLength(1);

    const imageA = withOutA.savedImages[0];
    const imageB = withOutB.savedImages[0];
    expect(path.dirname(imageA.imagePath)).toBe(path.join(outDir, withOutA.id));
    expect(path.dirname(imageB.imagePath)).toBe(path.join(outDir, withOutB.id));
    expect(imageA.imagePath).not.toBe(imageB.imagePath);

    for (const job of [withOutA, withOutB]) {
      const saved = job.savedImages[0];
      expect(fs.existsSync(saved.imagePath)).toBe(true);
      expect(fs.existsSync(saved.sidecarPath)).toBe(true);
      const bytes = fs.readFileSync(saved.imagePath);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      expect(saved.sha256).toBe(sha256);

      const sidecar = JSON.parse(fs.readFileSync(saved.sidecarPath, 'utf-8'));
      expect(sidecar).toMatchObject({
        jobId: job.id,
        providerId: 'mock',
        model: 'mock-image-v1',
        operation: 'text_to_image',
        prompt: 'simple blue square icon on a plain white background',
        sha256,
        size: bytes.byteLength,
        mimeType: 'image/png',
      });
      expect(typeof sidecar.savedAt).toBe('string');
      assertNoSentinel(JSON.stringify(job), JSON.stringify(sidecar));
    }
  });

  it('submits mock edit jobs', () => {
    const configDir = tempDir('config-edit');
    saveProfile(configDir, 'mock-dev');
    const inputPath = writeJson(tempDir('fixtures-edit'), 'edit-input.json', {
      profileId: 'mock-dev',
      prompt: 'adjust the geometric shape to blue',
      images: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
    });

    const job = expectSuccess(runImagen(['job', 'submit', 'provider-edit', `@${inputPath}`], { configDir }));
    expect(job.status).toBe('completed');
    expect(job.output.image.assets).toHaveLength(1);
  });

  it('reports missing durable jobs as JSON errors', () => {
    const configDir = tempDir('config-missing-job');
    const getJob = expectFailureJson(runImagen(['job', 'get', 'missing-job'], { configDir }));
    expect(getJob.error).toContain('Job not found');

    const retryJob = expectFailureJson(runImagen(['job', 'retry', 'missing-job'], { configDir }));
    expect(retryJob.error).toContain('not found');
  });

  it('persists terminal jobs into durable history for cross-process list and get', () => {
    const configDir = tempDir('config-durable-history');
    saveProfile(configDir, 'mock-dev');
    const inputPath = writeJson(tempDir('fixtures-durable-history'), 'input.json', {
      profileId: 'mock-dev',
      prompt: 'simple durable blue square icon',
    });

    const job = expectSuccess(runImagen(['job', 'submit', 'provider-generate', `@${inputPath}`], { configDir }));
    expect(job.status).toBe('completed');

    const listed = expectSuccess(runImagen(['job', 'list'], { configDir }));
    expect(listed.records).toHaveLength(1);
    expect(listed.records[0]).toMatchObject({
      schemaVersion: 1,
      jobId: job.id,
      status: 'completed',
      workflow: 'provider-generate',
      input: {
        profileId: 'mock-dev',
        prompt: 'simple durable blue square icon',
      },
    });
    expect(listed.records[0].outputs).toHaveLength(1);
    expect(listed.records[0].outputs[0].kind).toBe('hostObject');
    expect(JSON.stringify(listed)).not.toContain('imagePath');
    assertNoSentinel(JSON.stringify(listed));

    const fetched = expectSuccess(runImagen(['job', 'get', job.id], { configDir }));
    expect(fetched).toMatchObject({
      source: 'durable',
      record: {
        jobId: job.id,
        status: 'completed',
      },
    });
    expect(fetched.record.canCancel).toBeUndefined();
  });

  it('retries failed durable jobs across processes without persisting secret values', () => {
    const configDir = tempDir('config-durable-retry');
    const inputPath = writeJson(tempDir('fixtures-durable-retry'), 'input.json', {
      provider: 'missing-provider',
      prompt: 'retry should fail again',
      secretRefs: { apiKey: 'secret:provider-profile:mock-dev:apiKey' },
    });

    const failed = expectSuccess(runImagen(['job', 'submit', 'provider-generate', `@${inputPath}`], { configDir }));
    expect(failed.status).toBe('failed');

    const retry = expectSuccess(runImagen(['job', 'retry', failed.id], { configDir }));
    expect(retry.status).toBe('failed');
    expect(retry.id).not.toBe(failed.id);

    const listed = expectSuccess(runImagen(['job', 'list', '--status', 'failed'], { configDir }));
    expect(listed.records).toHaveLength(2);
    const retryRecord = listed.records.find((record: any) => record.jobId === retry.id);
    expect(retryRecord).toMatchObject({
      status: 'failed',
      workflow: 'provider-generate',
      originJobId: failed.id,
      retryAttempt: 1,
      input: {
        provider: 'missing-provider',
        prompt: 'retry should fail again',
        secretRefs: { apiKey: 'secret:provider-profile:mock-dev:apiKey' },
      },
    });
    assertNoSentinel(JSON.stringify(listed));
  });
});
