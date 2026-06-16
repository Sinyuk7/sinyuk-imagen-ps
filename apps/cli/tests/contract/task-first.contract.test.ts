import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertNoSentinel, expectSuccess, runImagen, saveProfile, tempDir } from './harness.js';

function expectSavedImage(job: any, outDir: string, operation: string, prompt: string): void {
  expect(job.status).toBe('completed');
  expect(job.savedImages).toHaveLength(1);

  const saved = job.savedImages[0];
  expect(path.dirname(saved.imagePath)).toBe(path.join(outDir, job.id));
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
    operation,
    prompt,
    sha256,
    size: bytes.byteLength,
    mimeType: 'image/png',
  });
  expect(typeof sidecar.savedAt).toBe('string');
  assertNoSentinel(JSON.stringify(job), JSON.stringify(sidecar));
}

describe('CLI task-first aliases', () => {
  it('generates through the same job submit output path', () => {
    const configDir = tempDir('config-generate');
    const outDir = tempDir('out-generate');
    const prompt = 'simple blue square icon on a plain white background';
    saveProfile(configDir, 'mock-dev');

    const job = expectSuccess(
      runImagen(['generate', '--profile', 'mock-dev', '--prompt', prompt, '--out', outDir], { configDir }),
    );

    expectSavedImage(job, outDir, 'text_to_image', prompt);
  });

  it('edits a local image file through the same job submit output path', () => {
    const configDir = tempDir('config-edit-alias');
    const outDir = tempDir('out-edit-alias');
    const fixtureDir = tempDir('fixtures-edit-alias');
    const imagePath = path.join(fixtureDir, 'input.png');
    const prompt = 'adjust the geometric shape to blue';
    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.writeFileSync(imagePath, Buffer.from('iVBORw0KGgo=', 'base64'));
    saveProfile(configDir, 'mock-dev');

    const job = expectSuccess(
      runImagen(['edit', '--profile', 'mock-dev', '--image', imagePath, '--prompt', prompt, '--out', outDir], {
        configDir,
      }),
    );

    expectSavedImage(job, outDir, 'image_edit', prompt);
  });
});
