/**
 * 由 `scripts/build-model-avatar-icons.mjs` 生成。
 *
 * 不要手改这个文件；修改 `asset/model-avatar-icons/*.svg` 后重新运行生成脚本。
 */
export type ModelAvatarIconName = 'gpt' | 'nano-banana' | 'google' | 'qwen' | 'grok' | 'doubao' | 'default';

const GptSvg = "<svg viewBox=\"0 0 32 32\" xmlns=\"http://www.w3.org/2000/svg\" width=\"100%\" height=\"100%\"><circle cx=\"16\" cy=\"16\" r=\"16\" fill=\"#58736D\"/><path fill=\"#FFFFFF\" fill-rule=\"evenodd\" d=\"M14 5h8v4h4v8h-4v2h-4v-4h4v-4h-4V7h-2v8h-4v2H8v4h4v4h2v2H6v-8h4v-2H6V9h4V7h4v6h2V5zm2 14h2v4h-2v-4zm-2 0v-4h-2v4h2zm2 8h2v-2h-2v2z\"/></svg>";

const NanoBananaSvg = "<svg viewBox=\"0 0 32 32\" xmlns=\"http://www.w3.org/2000/svg\" width=\"100%\" height=\"100%\"><circle cx=\"16\" cy=\"16\" r=\"16\" fill=\"#82672B\"/><path fill=\"#FFFFFF\" fill-rule=\"evenodd\" d=\"M10 7h4v2h-2v2h2v2h2v2h4v-2h2v-2h2v6h-2v4h-2v2h-4v-2h-2v-2h-2v-4h-2v-2H8V9h2V7zm4 8v2h2v-2h-2zm6 0v2h2v-2h-2zm-4 6h4v-2h-4v2zM8 23h2v2H8v-2zm14 0h2v2h-2v-2z\"/></svg>";

const GoogleSvg = "<svg viewBox=\"0 0 32 32\" xmlns=\"http://www.w3.org/2000/svg\" width=\"100%\" height=\"100%\"><circle cx=\"16\" cy=\"16\" r=\"16\" fill=\"#5D7091\"/><path fill=\"#FFFFFF\" fill-rule=\"evenodd\" d=\"M15 5h2v5h2v2h5v2h-5v2h-2v5h-2v-5h-2v-2H8v-2h5v-2h2V5zm1 7h-1v1h-1v1h1v1h1v-1h1v-1h-1v-1zm7 9h2v2h2v2h-2v2h-2v-2h-2v-2h2v-2zM7 20h2v2h2v2H9v2H7v-2H5v-2h2v-2z\"/></svg>";

const QwenSvg = "<svg viewBox=\"0 0 32 32\" xmlns=\"http://www.w3.org/2000/svg\" width=\"100%\" height=\"100%\"><circle cx=\"16\" cy=\"16\" r=\"16\" fill=\"#6D6AA6\"/><path fill=\"#FFFFFF\" fill-rule=\"evenodd\" d=\"M14 5h4v3h4v4h3v8h-3v4h-4v3h-4v-3h-4v-4H7v-8h3V8h4V5zm0 5h4v3h3v6h-3v3h-4v-3h-3v-6h3v-3zm2 4h-2v4h4v-4h-2zm0-4h-2v2h2v-2zm0 10h-2v2h2v-2zm5-6h-2v2h2v-2zm-8 0h-2v2h2v-2z\"/></svg>";

const GrokSvg = "<svg viewBox=\"0 0 32 32\" xmlns=\"http://www.w3.org/2000/svg\" width=\"100%\" height=\"100%\"><circle cx=\"16\" cy=\"16\" r=\"16\" fill=\"#6A7078\"/><path fill=\"#FFFFFF\" fill-rule=\"evenodd\" d=\"M14 5h4v6h3V8h3v3h3v4h-6v2h6v4h-3v3h-3v-3h-3v6h-4v-6h-3v3H8v-3H5v-4h6v-2H5v-4h3V8h3v3h3V5zm0 10h4v2h-4v-2z\"/></svg>";

const DoubaoSvg = "<svg viewBox=\"0 0 32 32\" xmlns=\"http://www.w3.org/2000/svg\" width=\"100%\" height=\"100%\"><circle cx=\"16\" cy=\"16\" r=\"16\" fill=\"#577D52\"/><path fill=\"#FFFFFF\" fill-rule=\"evenodd\" d=\"M15 5h4v3h3v3h-5v2h5v2h3v4h-3v3h-4v5h-4v-5h-4v-3H7v-4h3v-3h3V8h2V5zm-1 8h3v-2h-3v2zm-1 4h2v-2h-2v2zm5 0h2v-2h-2v2zm-4 3h6v-2h-6v2zM9 7h2v2h2v2H9V7z\"/></svg>";

const DefaultSvg = "<svg viewBox=\"0 0 32 32\" xmlns=\"http://www.w3.org/2000/svg\" width=\"100%\" height=\"100%\"><circle cx=\"16\" cy=\"16\" r=\"16\" fill=\"#667085\"/><path fill=\"#FFFFFF\" fill-rule=\"evenodd\" d=\"M14 6h4v4h-4V6zm-6 6h4v4H8v-4zm12 0h4v4h-4v-4zm-6 8h4v4h-4v-4zm-2-8h8v2h-8v-2zm0 8h8v2h-8v-2zm-2-4h2v6h-2v-6zm10 0h2v6h-2v-6z\"/></svg>";

export const MODEL_AVATAR_SVG_BY_NAME: Record<ModelAvatarIconName, string> = {
  'gpt': GptSvg,
  'nano-banana': NanoBananaSvg,
  'google': GoogleSvg,
  'qwen': QwenSvg,
  'grok': GrokSvg,
  'doubao': DoubaoSvg,
  'default': DefaultSvg,
};
