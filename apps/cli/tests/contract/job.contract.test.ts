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

  it('keeps job get and retry process-local', () => {
    const configDir = tempDir('config-process-local');
    const getJob = expectFailureJson(runImagen(['job', 'get', 'missing-job'], { configDir }));
    expect(getJob.error).toContain('only jobs from the current process are visible');

    const retryJob = expectFailureJson(runImagen(['job', 'retry', 'missing-job'], { configDir }));
    expect(retryJob.error).toContain('not found');
  });
});
