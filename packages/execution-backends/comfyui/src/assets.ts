import {
  createComfyUiExecutionError,
  normalizeComfyUiExecutionError,
} from './errors.js';
import type {
  ComfyUiAssetResolver,
  ComfyUiExecutionAssetInput,
  ComfyUiExecutionConnection,
  ComfyUiHttpTransport,
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

const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const PNG_IHDR = 'IHDR';
const PNG_IDAT = 'IDAT';
const PNG_IEND = 'IEND';
const DEFLATE_STORED_BLOCK_MAX = 0xffff;

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
      origin: connection.baseUrl,
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

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] * 0x1000000 + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]);
}
function writeUint16LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}
function writeUint32BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}
function pngType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}
function crc32(bytes: Uint8Array, offset = 0, length = bytes.byteLength - offset): number {
  let crc = 0xffffffff;
  for (let index = offset; index < offset + length; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(data.byteLength + 12);
  writeUint32BE(bytes, 0, data.byteLength);
  for (let index = 0; index < 4; index += 1) bytes[4 + index] = type.charCodeAt(index);
  bytes.set(data, 8);
  writeUint32BE(bytes, data.byteLength + 8, crc32(bytes, 4, data.byteLength + 4));
  return bytes;
}
function zlibStoredDeflate(data: Uint8Array): Uint8Array {
  const blockCount = Math.max(1, Math.ceil(data.byteLength / DEFLATE_STORED_BLOCK_MAX));
  const bytes = new Uint8Array(2 + blockCount * 5 + data.byteLength + 4);
  bytes[0] = 0x78; bytes[1] = 0x01;
  let source = 0; let offset = 2;
  for (let block = 0; block < blockCount; block += 1) {
    const length = Math.min(DEFLATE_STORED_BLOCK_MAX, data.byteLength - source);
    bytes[offset++] = block === blockCount - 1 ? 1 : 0;
    writeUint16LE(bytes, offset, length); writeUint16LE(bytes, offset + 2, (~length) & 0xffff); offset += 4;
    bytes.set(data.subarray(source, source + length), offset); source += length; offset += length;
  }
  writeUint32BE(bytes, offset, adler32(data));
  return bytes;
}
function readStoredDeflate(zlib: Uint8Array): Uint8Array {
  if (zlib.byteLength < 7 || zlib[0] !== 0x78 || zlib[1] !== 0x01) throw createComfyUiExecutionError('prepare', 'asset-unavailable');
  const output: Uint8Array[] = []; let total = 0; let offset = 2; let final = false;
  while (!final) {
    if (offset + 5 > zlib.byteLength - 4) throw createComfyUiExecutionError('prepare', 'asset-unavailable');
    const header = zlib[offset++];
    if ((header & 0xfe) !== 0) throw createComfyUiExecutionError('prepare', 'asset-unavailable');
    final = (header & 1) === 1;
    const length = zlib[offset] | (zlib[offset + 1] << 8);
    const complement = zlib[offset + 2] | (zlib[offset + 3] << 8); offset += 4;
    if (((length ^ complement) & 0xffff) !== 0xffff || offset + length > zlib.byteLength - 4) throw createComfyUiExecutionError('prepare', 'asset-unavailable');
    output.push(zlib.slice(offset, offset + length)); total += length; offset += length;
  }
  if (offset !== zlib.byteLength - 4) throw createComfyUiExecutionError('prepare', 'asset-unavailable');
  const raw = new Uint8Array(total); let destination = 0;
  for (const block of output) { raw.set(block, destination); destination += block.byteLength; }
  return raw;
}
function parseCanonicalMask(bytes: Uint8Array, width: number, height: number): Uint8Array {
  if (bytes.byteLength < PNG_SIGNATURE.byteLength + 12 || !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) throw createComfyUiExecutionError('prepare', 'asset-unavailable');
  let offset = PNG_SIGNATURE.byteLength; let ihdr: Uint8Array | undefined; const idat: Uint8Array[] = []; let complete = false;
  while (offset + 12 <= bytes.byteLength) {
    const length = readUint32BE(bytes, offset); const type = pngType(bytes, offset + 4); const dataOffset = offset + 8; const next = dataOffset + length + 4;
    if (next > bytes.byteLength || readUint32BE(bytes, dataOffset + length) !== crc32(bytes, offset + 4, length + 4)) throw createComfyUiExecutionError('prepare', 'asset-unavailable');
    const data = bytes.slice(dataOffset, dataOffset + length);
    if (type === PNG_IHDR) { if (ihdr !== undefined || length !== 13) throw createComfyUiExecutionError('prepare', 'asset-unavailable'); ihdr = data; }
    else if (type === PNG_IDAT) { if (ihdr === undefined || complete) throw createComfyUiExecutionError('prepare', 'asset-unavailable'); idat.push(data); }
    else if (type === PNG_IEND) { if (length !== 0 || ihdr === undefined || idat.length === 0 || next !== bytes.byteLength) throw createComfyUiExecutionError('prepare', 'asset-unavailable'); complete = true; break; }
    offset = next;
  }
  if (!complete || ihdr === undefined || readUint32BE(ihdr, 0) !== width || readUint32BE(ihdr, 4) !== height || ihdr[8] !== 8 || ihdr[9] !== 0 || ihdr[10] !== 0 || ihdr[11] !== 0 || ihdr[12] !== 0) throw createComfyUiExecutionError('prepare', 'asset-unavailable');
  const compressed = new Uint8Array(idat.reduce((sum, chunk) => sum + chunk.byteLength, 0)); let position = 0;
  for (const chunk of idat) { compressed.set(chunk, position); position += chunk.byteLength; }
  const raw = readStoredDeflate(compressed); const expected = height * (width + 1);
  if (raw.byteLength !== expected) throw createComfyUiExecutionError('prepare', 'asset-unavailable');
  for (let row = 0; row < height; row += 1) if (raw[row * (width + 1)] !== 0) throw createComfyUiExecutionError('prepare', 'asset-unavailable');
  return raw;
}
function encodeCanonicalMask(raw: Uint8Array, width: number, height: number): Uint8Array {
  const ihdr = new Uint8Array(13); writeUint32BE(ihdr, 0, width); writeUint32BE(ihdr, 4, height); ihdr[8] = 8;
  const chunks = [PNG_SIGNATURE, pngChunk(PNG_IHDR, ihdr), pngChunk(PNG_IDAT, zlibStoredDeflate(raw)), pngChunk(PNG_IEND, new Uint8Array())];
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
function prepareMaskAsset(asset: ComfyUiResolvedAsset, input: ComfyUiExecutionAssetInput, polarity: 'white-edit' | 'black-edit'): ComfyUiResolvedAsset {
  if (asset.mimeType.toLowerCase() !== 'image/png') throw createComfyUiExecutionError('prepare', 'asset-unavailable');
  const raw = parseCanonicalMask(asset.bytes, input.width, input.height);
  if (polarity === 'black-edit') {
    for (let row = 0; row < input.height; row += 1) {
      const start = row * (input.width + 1) + 1;
      for (let column = 0; column < input.width; column += 1) raw[start + column] = 0xff - raw[start + column];
    }
    const bytes = encodeCanonicalMask(raw, input.width, input.height);
    if (bytes.byteLength > COMFYUI_MAX_IMAGE_BYTES) throw createComfyUiExecutionError('prepare', 'asset-unavailable');
    return { bytes, mimeType: 'image/png', name: asset.name };
  }
  return { bytes: asset.bytes, mimeType: 'image/png', name: asset.name };
}

/** 解析、guard、mask encode 并完成全部 uploads 后才返回 barrier result。 */
export async function prepareComfyUiUploads(
  input: {
    readonly connection: ComfyUiExecutionConnection;
    readonly images: readonly ComfyUiExecutionAssetInput[];
    readonly mask?: { readonly asset: ComfyUiExecutionAssetInput; readonly polarity: 'white-edit' | 'black-edit' };
  },
  dependencies: {
    readonly resolver: ComfyUiAssetResolver;
    readonly transport: ComfyUiHttpTransport;
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
  if (input.mask === undefined) return { imageValues };
  const resolved = await resolveOne(dependencies.resolver, input.mask.asset, signal);
  const mask = prepareMaskAsset(resolved, input.mask.asset, input.mask.polarity);
  const maskValue = await uploadOne(input.connection, dependencies.transport, mask, `imagen-mask.${extensionForMime(mask.mimeType)}`, signal);
  return { imageValues, maskValue };
}
