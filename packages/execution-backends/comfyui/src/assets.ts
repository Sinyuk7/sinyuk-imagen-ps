import type { ContractMaskEncoding, ComfyUiWorkflowContract } from './contract/index.js';
import {
  createComfyUiExecutionError,
  normalizeComfyUiExecutionError,
} from './errors.js';
import type {
  ComfyUiAssetResolver,
  ComfyUiExecutionAssetInput,
  ComfyUiExecutionConnection,
  ComfyUiHttpTransport,
  ComfyUiMaskEncoder,
  ComfyUiResolvedAsset,
} from './execution-types.js';
import {
  decodeJsonBytes,
  hasExactKeys,
  isPlainRecord,
  safeRuntimeId,
  utf8ByteLength,
} from './internal/value.js';

/** 单个 input/output image 的默认 byte ceiling。 */
export const COMFYUI_MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** `/upload/image` acknowledgement 的 byte ceiling。 */
export const COMFYUI_MAX_UPLOAD_RESPONSE_BYTES = 8 * 1024;

/** 验证后的 ComfyUI upload descriptor。 */
export interface ComfyUiUploadDescriptor {
  readonly name: string;
  readonly subfolder: string;
  readonly type: 'input' | 'temp' | 'output';
}

/** Transport-neutral multipart upload request body。 */
export interface ComfyUiMultipartUploadRequest {
  readonly contentType: string;
  readonly body: Uint8Array;
}

/** Shared upload barrier 产生的 contract-aligned values。 */
export interface ComfyUiPreparedUploads {
  readonly imageValues: readonly string[];
  readonly maskValue?: string;
}

/** Image bytes signature 对应的 supported MIME。 */
export function detectComfyUiImageMime(bytes: Uint8Array): string | undefined {
  if (
    bytes.byteLength >= 8
    && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  ) return 'image/png';
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.byteLength >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  ) return 'image/webp';
  return undefined;
}

function normalizeMime(value: string): string {
  const normalized = value.split(';', 1)[0]?.trim().toLowerCase();
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
}

/** 验证 image MIME、signature、byte size 与 StoredAssetRef metadata。 */
export function validateComfyUiImageAsset(
  resolved: ComfyUiResolvedAsset,
  input: ComfyUiExecutionAssetInput,
): ComfyUiResolvedAsset {
  const mimeType = normalizeMime(resolved.mimeType);
  const signature = detectComfyUiImageMime(resolved.bytes);
  if (
    resolved.bytes.byteLength === 0
    || resolved.bytes.byteLength > COMFYUI_MAX_IMAGE_BYTES
    || signature === undefined
    || signature !== mimeType
    || (input.storedRef.mimeType !== undefined && normalizeMime(input.storedRef.mimeType) !== mimeType)
    || (input.storedRef.byteSize !== undefined && input.storedRef.byteSize !== resolved.bytes.byteLength)
  ) throw createComfyUiExecutionError('prepare', 'asset-unavailable');
  return {
    bytes: resolved.bytes.slice(),
    mimeType,
    ...(resolved.name !== undefined ? { name: resolved.name } : {}),
  };
}

/** 验证 `/view` image response MIME、signature 与 byte ceiling。 */
export function validateComfyUiDownloadedImage(
  bytes: Uint8Array,
  contentType: string | undefined,
): { readonly bytes: Uint8Array; readonly mimeType: string } {
  const mimeType = contentType === undefined ? undefined : normalizeMime(contentType);
  const signature = detectComfyUiImageMime(bytes);
  if (
    bytes.byteLength === 0
    || bytes.byteLength > COMFYUI_MAX_IMAGE_BYTES
    || mimeType === undefined
    || signature === undefined
    || mimeType !== signature
  ) throw createComfyUiExecutionError('download', 'download-failed');
  return { bytes: bytes.slice(), mimeType };
}

function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  throw createComfyUiExecutionError('prepare', 'asset-unavailable');
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function safeFilename(value: string): void {
  if (
    value.length === 0
    || value.length > 128
    || /[\u0000-\u001f\u007f/\\]/.test(value)
    || value.includes('..')
  ) throw createComfyUiExecutionError('upload', 'upload-failed');
}

/** 不依赖 DOM/FormData 构建 bounded `/upload/image` multipart body。 */
export function buildComfyUiMultipartUpload(
  asset: ComfyUiResolvedAsset,
  filename: string,
  boundary = safeRuntimeId('imagen-boundary'),
): ComfyUiMultipartUploadRequest {
  safeFilename(filename);
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(boundary)) {
    throw createComfyUiExecutionError('upload', 'upload-failed');
  }
  const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
  const parts = [
    encode(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${asset.mimeType}\r\n\r\n`),
    asset.bytes,
    encode(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\ninput`),
    encode(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\nfalse`),
    encode(`\r\n--${boundary}--\r\n`),
  ];
  const body = concatBytes(parts);
  if (body.byteLength > COMFYUI_MAX_IMAGE_BYTES + 16 * 1024) {
    throw createComfyUiExecutionError('upload', 'upload-failed');
  }
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body,
  };
}

function safeDescriptorPart(value: string, allowNested: boolean): boolean {
  if (
    utf8ByteLength(value) > 512
    || /[\u0000-\u001f\u007f\\]/.test(value)
    || value.includes('%')
    || value.startsWith('/')
    || /^[A-Za-z]:/.test(value)
  ) return false;
  const parts = value.split('/');
  if (!allowNested && parts.length !== 1) return false;
  return parts.every((part) => part !== '.' && part !== '..' && (allowNested || part.length > 0));
}

/** 验证 bounded upload/history image descriptor。 */
export function validateComfyUiUploadDescriptor(value: unknown): ComfyUiUploadDescriptor {
  if (!isPlainRecord(value)) throw createComfyUiExecutionError('upload', 'upload-failed');
  const hasName = Object.prototype.hasOwnProperty.call(value, 'name');
  const hasFilename = Object.prototype.hasOwnProperty.call(value, 'filename');
  if (hasName === hasFilename) throw createComfyUiExecutionError('upload', 'upload-failed');
  const requiredName = hasName ? 'name' : 'filename';
  if (!hasExactKeys(value, [requiredName, 'subfolder', 'type'])) {
    throw createComfyUiExecutionError('upload', 'upload-failed');
  }
  const name = value[requiredName];
  if (
    typeof name !== 'string'
    || name.length === 0
    || !safeDescriptorPart(name, false)
    || typeof value.subfolder !== 'string'
    || !safeDescriptorPart(value.subfolder, true)
    || (value.type !== 'input' && value.type !== 'temp' && value.type !== 'output')
  ) throw createComfyUiExecutionError('upload', 'upload-failed');
  return { name, subfolder: value.subfolder, type: value.type };
}

/** Upload response bytes 解码为 bounded descriptor。 */
export function parseComfyUiUploadResponse(body: Uint8Array): ComfyUiUploadDescriptor {
  if (body.byteLength === 0 || body.byteLength > COMFYUI_MAX_UPLOAD_RESPONSE_BYTES) {
    throw createComfyUiExecutionError('upload', 'upload-failed');
  }
  try {
    return validateComfyUiUploadDescriptor(decodeJsonBytes(body));
  } catch (error) {
    throw normalizeComfyUiExecutionError(error, { stage: 'upload', code: 'upload-failed' });
  }
}

/** Descriptor 映射为 exact LoadImage/widget value。 */
export function comfyUiUploadDescriptorToWidgetValue(descriptor: ComfyUiUploadDescriptor): string {
  const checked = validateComfyUiUploadDescriptor({
    name: descriptor.name,
    subfolder: descriptor.subfolder,
    type: descriptor.type,
  });
  return checked.subfolder.length === 0 ? checked.name : `${checked.subfolder}/${checked.name}`;
}

async function uploadOne(
  connection: ComfyUiExecutionConnection,
  transport: ComfyUiHttpTransport,
  asset: ComfyUiResolvedAsset,
  filename: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  if (signal?.aborted) throw createComfyUiExecutionError('upload', 'upload-failed');
  const multipart = buildComfyUiMultipartUpload(asset, filename);
  let response;
  try {
    response = await transport.request({
      origin: connection.origin,
      method: 'POST',
      path: '/upload/image',
      headers: { 'content-type': multipart.contentType },
      body: multipart.body,
      timeoutMs: connection.requestTimeoutMs,
      maxResponseBytes: COMFYUI_MAX_UPLOAD_RESPONSE_BYTES,
    }, signal);
  } catch (error) {
    throw normalizeComfyUiExecutionError(error, { stage: 'upload', code: 'upload-failed' });
  }
  if (response.status < 200 || response.status >= 300 || response.body.byteLength > COMFYUI_MAX_UPLOAD_RESPONSE_BYTES) {
    throw createComfyUiExecutionError('upload', 'upload-failed');
  }
  return comfyUiUploadDescriptorToWidgetValue(parseComfyUiUploadResponse(response.body));
}

async function resolveOne(
  resolver: ComfyUiAssetResolver,
  input: ComfyUiExecutionAssetInput,
  signal: AbortSignal | undefined,
): Promise<ComfyUiResolvedAsset> {
  if (signal?.aborted) throw createComfyUiExecutionError('prepare', 'asset-unavailable');
  let resolved;
  try {
    resolved = await resolver.resolve(input.storedRef, signal);
  } catch (error) {
    throw normalizeComfyUiExecutionError(error, { stage: 'prepare', code: 'asset-unavailable' });
  }
  if (resolved === undefined) throw createComfyUiExecutionError('prepare', 'asset-unavailable');
  return validateComfyUiImageAsset(resolved, input);
}

function maskEncoding(contract: ComfyUiWorkflowContract): ContractMaskEncoding | undefined {
  return contract.entries.find((entry) => entry.role === 'mask')?.maskEncoding;
}

/** 解析、guard、mask encode 并完成全部 uploads 后才返回 barrier result。 */
export async function prepareComfyUiUploads(
  input: {
    readonly connection: ComfyUiExecutionConnection;
    readonly contract: ComfyUiWorkflowContract;
    readonly images: readonly ComfyUiExecutionAssetInput[];
    readonly mask?: ComfyUiExecutionAssetInput;
  },
  dependencies: {
    readonly resolver: ComfyUiAssetResolver;
    readonly transport: ComfyUiHttpTransport;
    readonly maskEncoder?: ComfyUiMaskEncoder;
  },
  signal?: AbortSignal,
): Promise<ComfyUiPreparedUploads> {
  const imageValues: string[] = [];
  for (let index = 0; index < input.images.length; index += 1) {
    const asset = await resolveOne(dependencies.resolver, input.images[index], signal);
    imageValues.push(await uploadOne(
      input.connection,
      dependencies.transport,
      asset,
      `imagen-input-${index}.${extensionForMime(asset.mimeType)}`,
      signal,
    ));
  }

  let maskValue: string | undefined;
  if (input.mask !== undefined) {
    const encoding = maskEncoding(input.contract);
    if (encoding === undefined || dependencies.maskEncoder === undefined) {
      throw createComfyUiExecutionError('prepare', 'invalid-contract');
    }
    const source = await resolveOne(dependencies.resolver, input.mask, signal);
    let encoded: ComfyUiResolvedAsset;
    try {
      encoded = await dependencies.maskEncoder.encode(
        source,
        encoding,
        { width: input.mask.width, height: input.mask.height },
        signal,
      );
    } catch (error) {
      throw normalizeComfyUiExecutionError(error, { stage: 'prepare', code: 'asset-unavailable' });
    }
    const checked = validateComfyUiImageAsset(encoded, {
      ...input.mask,
      storedRef: {
        kind: input.mask.storedRef.kind,
        ref: input.mask.storedRef.ref,
      },
    });
    maskValue = await uploadOne(
      input.connection,
      dependencies.transport,
      checked,
      `imagen-mask-0.${extensionForMime(checked.mimeType)}`,
      signal,
    );
  }
  return {
    imageValues,
    ...(maskValue !== undefined ? { maskValue } : {}),
  };
}
