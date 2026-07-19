/** 在宿主默认应用中打开受信任的 HTTP(S) URL。 */
export interface ExternalUrlPort {
  open(url: string, developerText?: string): Promise<void>;
}
