import type { StoredAssetRef } from '@imagen-ps/core-engine';
import type { TaskRecord, TaskRemoteOutput } from '../task.js';

/** 用户主动置入时的 provider 查询端口；每次 action 最多调用一次。 */
export interface RemoteOutputQuery {
  query(task: TaskRecord): Promise<readonly TaskRemoteOutput[]>;
}

/** 独立 URL 物化端口。 */
export interface RemoteOutputDownloader {
  download(output: TaskRemoteOutput, signal?: AbortSignal): Promise<StoredAssetRef>;
}

/** 按 local asset → URL → 单次 remote query 的顺序解析 output。 */
export async function resolveOutputOnDemand(
  task: TaskRecord,
  output: TaskRemoteOutput,
  services: { readonly download: RemoteOutputDownloader; readonly query: RemoteOutputQuery },
  signal?: AbortSignal,
): Promise<StoredAssetRef> {
  if (output.assetRef) return output.assetRef;
  if (output.url) return services.download.download(output, signal);
  const queried = await services.query.query(task);
  const match = queried.find((candidate) => candidate.outputId === output.outputId || candidate.index === output.index);
  if (!match) throw new Error('Remote output is unavailable and cannot be recovered.');
  return services.download.download(match, signal);
}
