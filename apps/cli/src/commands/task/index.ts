import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { error } from '../../utils/output.js';
import { executeCliJob } from '../job/executor.js';

interface GenerateOptions {
  readonly profile?: string;
  readonly prompt?: string;
  readonly model?: string;
  readonly out?: string;
}

interface EditOptions extends GenerateOptions {
  readonly image?: string;
}

function requireString(value: string | undefined, message: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    error(message);
  }
  return value;
}

function providerOptions(model: string | undefined): Record<string, unknown> | undefined {
  return model ? { model } : undefined;
}

function mimeTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') {
    return 'image/jpeg';
  }
  if (ext === '.webp') {
    return 'image/webp';
  }
  return 'image/png';
}

function readImageAsset(imagePath: string): Record<string, unknown> {
  try {
    const bytes = fs.readFileSync(imagePath);
    return {
      type: 'image',
      name: path.basename(imagePath),
      data: bytes.toString('base64'),
      mimeType: mimeTypeFor(imagePath),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`Failed to read image file: ${msg}`);
  }
}

export function registerTaskCommands(program: Command): void {
  program
    .command('generate')
    .description('通过 task-first flags 提交 text-to-image job')
    .requiredOption('--profile <profileId>', 'Provider profile ID')
    .requiredOption('--prompt <prompt>', '文本 prompt')
    .option('--model <model>', '覆盖 profile 默认 model')
    .option('--out <dir>', '把图片产物和 sidecar metadata 写入 <dir>')
    .action(async (options: GenerateOptions) => {
      const profileId = requireString(options.profile, '--profile is required');
      const prompt = requireString(options.prompt, '--prompt is required');
      await executeCliJob(
        'provider-generate',
        {
          profileId,
          prompt,
          ...(options.model ? { providerOptions: providerOptions(options.model) } : {}),
        },
        { out: options.out },
      );
    });

  program
    .command('edit')
    .description('通过 task-first flags 提交 image edit job')
    .requiredOption('--profile <profileId>', 'Provider profile ID')
    .requiredOption('--image <path>', '输入图片文件')
    .requiredOption('--prompt <prompt>', '编辑 prompt')
    .option('--model <model>', '覆盖 profile 默认 model')
    .option('--out <dir>', '把图片产物和 sidecar metadata 写入 <dir>')
    .action(async (options: EditOptions) => {
      const profileId = requireString(options.profile, '--profile is required');
      const imagePath = requireString(options.image, '--image is required');
      const prompt = requireString(options.prompt, '--prompt is required');
      await executeCliJob(
        'provider-edit',
        {
          profileId,
          prompt,
          images: [readImageAsset(imagePath)],
          ...(options.model ? { providerOptions: providerOptions(options.model) } : {}),
        },
        { out: options.out },
      );
    });
}
