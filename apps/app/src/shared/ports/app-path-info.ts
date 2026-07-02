export interface AppPathInfo {
  readonly logPath: string;
  readonly generatedImagePath: string;
}

export interface AppPathInfoPort {
  getPathInfo(): Promise<AppPathInfo>;
}

export function createStaticAppPathInfoPort(pathInfo: AppPathInfo): AppPathInfoPort {
  return {
    async getPathInfo(): Promise<AppPathInfo> {
      return pathInfo;
    },
  };
}
