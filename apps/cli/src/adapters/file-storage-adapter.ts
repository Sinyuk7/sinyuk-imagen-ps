import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

/**
 * 落盘所需的最小 image asset 结构（只保留保存图片所需字段，不引入跨包类型依赖）。
 */
export interface ImageAsset {
  readonly name?: string;
  readonly url?: string;
  readonly data?: string | Uint8Array;
  readonly mimeType?: string;
}

/**
 * 落盘 sidecar 元数据。
 *
 * 与图片同名（扩展名 `.json`），用于产物可追踪：providerId / model /
 * operation / prompt / sha256 / size / mimeType / savedAt / usage。
 */
export interface ImageSaveMetadata {
  readonly jobId?: string;
  readonly providerId: string;
  readonly model?: string;
  readonly operation: string;
  readonly prompt?: string;
  readonly usage?: unknown;
}

/** saveImageWithSidecar 的返回，供调用方回显落盘路径。 */
export interface SavedImage {
  readonly imagePath: string;
  readonly sidecarPath: string;
  readonly sha256: string;
  readonly size: number;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** 把任意 asset 名约束为安全的文件 stem（去目录分隔符与扩展名）。 */
function safeStem(name: string | undefined, index: number): string {
  const fallback = `image-${index + 1}`;
  if (!name) {
    return fallback;
  }
  const base = path.basename(name).replace(/\.(png|jpe?g|webp)$/i, '');
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * 把 Asset 的图片数据解析为 bytes。
 *
 * 支持三种来源（与 provider 归一化后的 Asset 一致）：
 * - `data: Uint8Array`（如 mock provider）→ 直接使用。
 * - `data: string`（base64，可带 `data:...;base64,` 前缀，如 openai-compatible b64_json）→ 解码。
 * - `url`（无内联 data，如 openai-compatible 默认 url 模式）→ fetch 下载。
 */
async function resolveBytes(asset: ImageAsset): Promise<Uint8Array> {
  if (asset.data instanceof Uint8Array) {
    return asset.data;
  }
  if (typeof asset.data === 'string' && asset.data.length > 0) {
    const comma = asset.data.startsWith('data:') ? asset.data.indexOf(',') + 1 : 0;
    const b64 = asset.data.slice(comma);
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  if (typeof asset.url === 'string' && asset.url.length > 0) {
    const res = await fetch(asset.url);
    if (!res.ok) {
      throw new Error(`Failed to download asset url (HTTP ${res.status}): ${asset.url}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new Error('Asset has no inline data or url to save.');
}

/**
 * 把单个 image asset 落盘为 `<stem>.<ext>` + `<stem>.json` sidecar。
 *
 * sidecar 的 `sha256` 对落盘 bytes 计算，调用方/测试可据此做哈希自洽校验。
 */
export async function saveImageWithSidecar(
  asset: ImageAsset,
  meta: ImageSaveMetadata,
  outDir: string,
  index = 0,
): Promise<SavedImage> {
  const jobOutDir = meta.jobId ? path.join(outDir, meta.jobId) : outDir;
  fs.mkdirSync(jobOutDir, { recursive: true });

  const bytes = await resolveBytes(asset);
  const mimeType = asset.mimeType ?? 'image/png';
  const ext = EXT_BY_MIME[mimeType] ?? 'png';
  const stem = safeStem(asset.name, index);
  const imagePath = path.join(jobOutDir, `${stem}.${ext}`);
  const sidecarPath = path.join(jobOutDir, `${stem}.json`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  fs.writeFileSync(imagePath, bytes);

  const sidecar = {
    ...(meta.jobId ? { jobId: meta.jobId } : {}),
    providerId: meta.providerId,
    ...(meta.model ? { model: meta.model } : {}),
    operation: meta.operation,
    ...(meta.prompt !== undefined ? { prompt: meta.prompt } : {}),
    sha256,
    size: bytes.byteLength,
    mimeType,
    savedAt: new Date().toISOString(),
    ...(meta.usage !== undefined ? { usage: meta.usage } : {}),
  };
  fs.writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);

  return { imagePath, sidecarPath, sha256, size: bytes.byteLength };
}
