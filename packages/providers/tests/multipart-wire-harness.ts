import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

export interface CapturedHttpRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: Uint8Array;
}

export interface MultipartPartSummary {
  readonly name: string;
  readonly filename?: string;
  readonly mimeType?: string;
  readonly size: number;
  readonly sha256: string;
  readonly order: number;
  readonly contentDisposition: string;
}

export interface MultipartCaptureResult {
  readonly boundary: string;
  readonly parts: readonly MultipartPartSummary[];
}

export async function withCapturedRequest<T>(
  run: (serverUrl: string, readCaptured: () => Promise<CapturedHttpRequest>) => Promise<T>,
): Promise<T> {
  let resolveRequest: ((value: CapturedHttpRequest) => void) | undefined;
  const requestPromise = new Promise<CapturedHttpRequest>((resolve) => {
    resolveRequest = resolve;
  });

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => {
      resolveRequest?.({
        method: req.method ?? 'GET',
        url: req.url ?? '/',
        headers: req.headers,
        body: new Uint8Array(Buffer.concat(chunks)),
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ url: 'https://example.com/captured.png' }] }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.once('error', reject);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    throw new Error('Failed to resolve multipart capture server address.');
  }

  try {
    return await run(`http://127.0.0.1:${address.port}`, async () => requestPromise);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function parseMultipartBody(
  contentType: string | undefined,
  body: Uint8Array,
): MultipartCaptureResult {
  const boundary = contentType?.match(/boundary=([^;]+)/i)?.[1];
  if (!boundary) {
    throw new Error(`Multipart boundary missing from content-type: ${contentType ?? '<missing>'}`);
  }

  const text = decodeUtf8(body);
  const chunks = text
    .split(`--${boundary}`)
    .slice(1, -1)
    .map((chunk) => chunk.replace(/^\r\n/, '').replace(/\r\n$/, ''));

  const encoder = new TextEncoder();
  const parts = chunks.map((chunk, index) => {
    const separator = '\r\n\r\n';
    const headerEnd = chunk.indexOf(separator);
    if (headerEnd < 0) {
      throw new Error(`Multipart chunk ${index} is missing a header/body separator.`);
    }
    const rawHeaders = chunk.slice(0, headerEnd).split('\r\n');
    const bodyText = chunk.slice(headerEnd + separator.length);
    const headers = Object.fromEntries(rawHeaders.map((line) => {
      const colon = line.indexOf(':');
      return [line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()];
    }));
    const contentDisposition = headers['content-disposition'];
    const name = contentDisposition?.match(/name="([^"]+)"/)?.[1];
    if (!contentDisposition || !name) {
      throw new Error(`Multipart chunk ${index} is missing a valid content-disposition name.`);
    }
    const filename = contentDisposition.match(/filename="([^"]+)"/)?.[1];
    const mimeType = headers['content-type'];
    const partBytes = encoder.encode(bodyText);
    return {
      name,
      ...(filename ? { filename } : {}),
      ...(mimeType ? { mimeType } : {}),
      size: partBytes.byteLength,
      sha256: createHash('sha256').update(partBytes).digest('hex'),
      order: index,
      contentDisposition,
    } satisfies MultipartPartSummary;
  });

  return { boundary, parts };
}
