export interface DiagnosticsRecord {
  readonly event: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
}

export interface DiagnosticsPort {
  checkpoint(
    event: string,
    attrs?: Readonly<Record<string, unknown>>,
    context?: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  failure(
    event: string,
    error: unknown,
    attrs?: Readonly<Record<string, unknown>>,
    context?: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  recent?(): readonly DiagnosticsRecord[];
}

interface GlobalDiagnosticsRecorder {
  checkpoint(event: string, attrs?: Record<string, unknown>): Promise<void>;
  fail(event: string, error: unknown, attrs?: Record<string, unknown>): Promise<void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __IMAGEN_PS_UI_FLIGHT_RECORDER__: GlobalDiagnosticsRecorder | undefined;
  // eslint-disable-next-line no-var
  var __IMAGEN_PS_DIAGNOSTIC_DISABLE_UI_FLIGHT_RECORDER__: boolean | undefined;
}

/** 把可选 host-installed recorder 暴露为 shared diagnostics port。 */
export function getGlobalDiagnosticsPort(): DiagnosticsPort | undefined {
  const recorder = globalThis.__IMAGEN_PS_UI_FLIGHT_RECORDER__;
  if (!recorder || globalThis.__IMAGEN_PS_DIAGNOSTIC_DISABLE_UI_FLIGHT_RECORDER__ === true) {
    return undefined;
  }
  return {
    async checkpoint(event, attrs) {
      await recorder.checkpoint(event, attrs === undefined ? undefined : { ...attrs });
    },
    async failure(event, error, attrs) {
      await recorder.fail(event, error, attrs === undefined ? undefined : { ...attrs });
    },
  };
}

/** 默认 diagnostics adapter：供不支持持久日志的 runtime 使用。 */
export function createNoopDiagnosticsPort(): DiagnosticsPort {
  return {
    async checkpoint(): Promise<void> {
      return undefined;
    },
    async failure(): Promise<void> {
      return undefined;
    },
    recent(): readonly DiagnosticsRecord[] {
      return [];
    },
  };
}
