import { getProviderProfile } from '@imagen-ps/application';
import { saveImageWithSidecar, type ImageAsset, type SavedImage } from '../../adapters/file-storage-adapter.js';
import { success, error } from '../../utils/output.js';
import { getCliSession } from './session.js';

/** workflow 名称到 sidecar.operation 的 CLI-local 映射。 */
const OPERATION_BY_WORKFLOW: Record<string, string> = {
  'provider-generate': 'text_to_image',
  'provider-edit': 'image_edit',
};

/**
 * 递归把重型字段替换为摘要，避免 stdout 被图片数据淹没。
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

/** 解析 sidecar 所需的 providerId / model。 */
async function resolveMeta(input: Record<string, unknown>): Promise<{ providerId: string; model?: string }> {
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

/**
 * 执行 CLI job submit 并处理 CLI-only 输出逻辑。
 *
 * 这是 `job submit`、`generate`、`edit` 的共同入口。公共 application 层只接收
 * workflow + input；`--out`、sidecar、stdout elision 都留在 CLI。
 */
export async function executeCliJob(
  workflow: string,
  input: Record<string, unknown>,
  options: { out?: string },
): Promise<never> {
  try {
    const result = await getCliSession().submitJob({
      workflow: workflow as never,
      input,
    });
    if (!result.ok) {
      error(result.error.message);
    }

    const job = result.value;
    let savedImages: SavedImage[] | undefined;

    if (options.out && (job as { status?: string }).status === 'completed') {
      const assets = extractAssets(job);
      if (assets.length > 0) {
        const { providerId, model } = await resolveMeta(input);
        const operation = OPERATION_BY_WORKFLOW[workflow] ?? workflow;
        const prompt = typeof input.prompt === 'string' ? input.prompt : undefined;
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

    const printable = savedImages ? { ...job, savedImages } : job;
    success(elideHeavy(printable));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(msg);
  }
}
