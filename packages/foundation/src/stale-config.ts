/** 可持久化的配置缓存适配器。 */
export interface ConfigCache<T> {
  readonly read: () => T | undefined;
  readonly write: (value: T) => void | Promise<void>;
}

/** 滞后更新配置的即时快照。 */
export interface ConfigSnapshot<T> {
  readonly value: T;
  readonly source: 'cache' | 'default';
}

/** 先读缓存、后台刷新远端、下次加载生效的配置存储。 */
export interface StaleConfigStore<T> {
  readonly loadSnapshot: () => ConfigSnapshot<T>;
  readonly refreshInBackground: () => Promise<void>;
}

/**
 * 创建不会阻塞调用方的配置存储。
 * 远端刷新只写入 cache，当前内存快照不会被替换。
 */
export function createStaleConfigStore<T>(input: {
  readonly cache: ConfigCache<T>;
  readonly fallback: T;
  readonly fetchRemote: () => Promise<T>;
}): StaleConfigStore<T> {
  return {
    loadSnapshot() {
      const cached = input.cache.read();
      return cached === undefined ? { value: input.fallback, source: 'default' } : { value: cached, source: 'cache' };
    },
    async refreshInBackground() {
      const remote = await input.fetchRemote();
      await input.cache.write(remote);
    },
  };
}
