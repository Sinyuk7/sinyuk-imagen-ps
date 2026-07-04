import type { ProviderDescriptor } from '../../contract/provider.js';
import type { CanonicalImageJobRequest } from '../../contract/request.js';
import type { ProviderDiagnostic } from '../../contract/diagnostics.js';
import type { ChatImageCompletionBody } from './build-request.js';
import type { ParsedChatImageResponse } from './parse-response.js';
import { chatCompletionsImageLegacyCodec } from './legacy-codec.js';

/** Chat image codec 的构建上下文。 */
export interface ChatImageCodecContext {
  /** provider config 中声明的默认 model。 */
  readonly defaultModel?: string;
}

/** Chat image codec 构造出的完整执行请求。 */
export interface BuiltChatImageRequest {
  /** codec 拥有的 HTTP method。 */
  readonly method: 'POST';

  /** codec 拥有的相对路径。 */
  readonly path: string;

  /** codec 构造出的执行 body。 */
  readonly body: ChatImageCompletionBody;

  /** 构造阶段产生的非阻塞诊断。 */
  readonly diagnostics?: readonly ProviderDiagnostic[];
}

/** Chat image 执行 codec 的完整请求/响应边界。 */
export interface ChatImageWireCodec {
  /** 当前 codec 的稳定标识。 */
  readonly id: 'chat-completions-image-legacy';

  /** 构造执行请求。 */
  buildRequest(request: CanonicalImageJobRequest, context: ChatImageCodecContext): BuiltChatImageRequest;

  /** 解析执行响应。 */
  parseExecutionResponse(raw: unknown): ParsedChatImageResponse;
}

function normalizeCodecList(codecs: readonly string[] | undefined): readonly string[] {
  return codecs === undefined ? [] : [...new Set(codecs)];
}

/** 从 descriptor 解析 chat-image 当前应使用的请求 codec。 */
export function resolveChatImageWireCodec(descriptor: ProviderDescriptor): ChatImageWireCodec {
  const supported = normalizeCodecList(descriptor.transport?.wire?.supportedImageRequestCodecs);
  const selected = descriptor.transport?.wire?.defaultImageRequestCodec;

  if (supported.length === 0) {
    throw new Error(`Chat image descriptor "${descriptor.id}" must declare supportedImageRequestCodecs.`);
  }
  if (selected === undefined) {
    throw new Error(`Chat image descriptor "${descriptor.id}" must declare defaultImageRequestCodec.`);
  }
  if (!supported.includes(selected)) {
    throw new Error(
      `Chat image descriptor "${descriptor.id}" defaultImageRequestCodec "${selected}" is not listed in supportedImageRequestCodecs.`,
    );
  }
  if (selected !== chatCompletionsImageLegacyCodec.id) {
    throw new Error(`Chat image request codec "${selected}" is not implemented.`);
  }

  return chatCompletionsImageLegacyCodec;
}
