declare module 'upng-js' {
  export interface DecodedPng {
    readonly width: number;
    readonly height: number;
    readonly depth: number;
    readonly ctype: number;
    readonly data: ArrayBuffer;
    readonly frames?: readonly unknown[];
    readonly tabs?: Record<string, unknown>;
  }

  export interface UpngApi {
    decode(buffer: ArrayBuffer): DecodedPng;
    toRGBA8(image: DecodedPng): ArrayBuffer[];
    encode(frames: ArrayBuffer[], width: number, height: number, colorCount: number, delays?: number[]): ArrayBuffer;
  }

  const UPNG: UpngApi;
  export default UPNG;
}
