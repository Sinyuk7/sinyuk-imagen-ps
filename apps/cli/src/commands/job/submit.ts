import type { Command } from 'commander';
import { getProviderProfile } from '@imagen-ps/application';
import { parseJsonInput } from '../../utils/input.js';
import { success, error } from '../../utils/output.js';
import { saveImageWithSidecar, type ImageAsset, type SavedImage } from '../../adapters/file-storage-adapter.js';
import { getCliSession } from './session.js';

/** workflow 名 → canonical operation，用于 sidecar.operation。 */
const OPERATION_BY_WORKFLOW: Record<string, string> = {
  'provider-generate': 'text_to_image',
  'provider-edit': 'image_edit',
};

/**
 * 递归把重型字段（二进制 bytes / 长字符串如 base64 图片数据）替换为占位摘要，
 * 让 stdout 的 Job JSON 可观察——结构完整，但不被原始图片数据淹没。
 * 仅用于打印；落盘走原始数据。
 */
function elideHeavy(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return `<bytes:${value.byteLength}>`;
  }
  if (typeof value === 'string') {
    return value.length > 200 ? `<string:${value.length} chars>` : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => elideHeavy(item));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = elideHeavy(v);
    }
    return out;
  }
  return value;
}

/** 从 job 输出中取出 provider 返回的 image assets。 */
function extractAssets(job: unknown): ImageAsset[] {
  const output = (job as { output?: Record<string, unknown> } | undefined)?.output;
  const image = output?.image as { assets?: unknown } | undefined;
  const assets = image?.assets;
  return Array.isArray(assets) ? (assets as ImageAsset[]) : [];
}

/** 解析 sidecar 所需的 providerId / model（基于 input 中的 profileId）。 */
async function resolveMeta(
  input: Record<string, unknown>,
): Promise<{ providerId: string; model?: string }> {
  const profileId = (input.profileId ?? input.providerProfileId) as string | undefined;
  let providerId = 'unknown';
  let defaultModel: string | undefined;
  if (profileId) {
    const result = await getProviderProfile(profileId);
    if (result.ok) {
      providerId = result.value.providerId;
      const dm = result.value.config.defaultModel;
      defaultModel = typeof dm === 'string' ? dm : undefined;
    }
  }
  const optModel = (input.providerOptions as { model?: unknown } | undefined)?.model;
  const model = typeof optModel === 'string' ? optModel : defaultModel;
  return { providerId, ...(model ? { model } : {}) };
}

export function registerJobSubmit(parent: Command): void {
  parent
    .command('submit <workflow> <inputJson>')
    .description('Submit a new job (inputJson: JSON string or @file)')
    .option('--out <dir>', 'Write produced image assets + sidecar metadata into <dir>')
    .action(async (workflow: string, inputJson: string, options: { out?: string }) => {
      let input: unknown;
      try {
        input = parseJsonInput(inputJson);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        error(msg);
      }

      try {
        const result = await getCliSession().submitJob({
          workflow: workflow as never,
          input: input as Record<string, unknown>,
        });
        if (!result.ok) {
          // Job submission itself failed at command level
          error(result.error.message);
        }

        const job = result.value;
        let savedImages: SavedImage[] | undefined;

        // --out：把产物落盘为 PNG + sidecar（仅当 job 完成且有 image assets）。
        if (options.out && (job as { status?: string }).status === 'completed') {
          const assets = extractAssets(job);
          if (assets.length > 0) {
            const inputObj = input as Record<string, unknown>;
            const { providerId, model } = await resolveMeta(inputObj);
            const operation = OPERATION_BY_WORKFLOW[workflow] ?? workflow;
            const prompt = typeof inputObj.prompt === 'string' ? inputObj.prompt : undefined;
            const usage = ((job as { output?: Record<string, unknown> }).output?.image as
              | { usage?: unknown }
              | undefined)?.usage;

            savedImages = [];
            for (let i = 0; i < assets.length; i++) {
              const saved = await saveImageWithSidecar(
                assets[i],
                { jobId: job.id, providerId, ...(model ? { model } : {}), operation, prompt, usage },
                options.out,
                i,
              );
              savedImages.push(saved);
            }
          }
        }

        // Output the Job object (may have status: 'failed' — that's a business result),
        // 附带 --out 落盘回执（若有）。stdout 用 elide 版避免被原始图片数据淹没，便于观察。
        const printable = savedImages ? { ...job, savedImages } : job;
        success(elideHeavy(printable));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        error(msg);
      }
    });
}
