import type { ChatImageWireCodec } from './request-codec.js';
import { buildChatImageRequest } from './build-request.js';
import { parseChatImageResponse } from './parse-response.js';

/** 当前 `/chat/completions` legacy codec。 */
export const chatCompletionsImageLegacyCodec: ChatImageWireCodec = {
  id: 'chat-completions-image-legacy',

  buildRequest(request) {
    const built = buildChatImageRequest(request);
    return {
      method: 'POST',
      path: '/chat/completions',
      body: built.body,
      ...(built.diagnostics.length > 0 ? { diagnostics: built.diagnostics } : {}),
    };
  },

  parseExecutionResponse(raw) {
    return parseChatImageResponse(raw);
  },
};
