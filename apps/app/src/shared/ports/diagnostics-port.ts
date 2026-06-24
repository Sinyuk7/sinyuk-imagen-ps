export interface DiagnosticsRecord {
  readonly event: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
}

export interface DiagnosticsPort {
  checkpoint(event: string, attrs?: Readonly<Record<string, unknown>>): Promise<void>;
  failure(event: string, error: unknown, attrs?: Readonly<Record<string, unknown>>): Promise<void>;
  recent?(): readonly DiagnosticsRecord[];
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
