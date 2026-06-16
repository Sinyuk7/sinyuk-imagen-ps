import { useCallback, useEffect, useState } from 'react';
import type { DurableJobRecord } from '@imagen-ps/application';
import type { AppServices } from '../../app-services/app-services';

type JobHistoryStatus = 'completed' | 'failed';

export interface JobHistoryState {
  readonly records: readonly DurableJobRecord[];
  readonly loading: boolean;
  readonly error?: string;
  readonly reload: () => Promise<void>;
}

/** 从 application durable history command 读取历史 job record。 */
export function useJobHistory(services: AppServices, status?: JobHistoryStatus): JobHistoryState {
  const [records, setRecords] = useState<readonly DurableJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const next = await services.commands.listJobHistoryRecords({
        limit: 50,
        ...(status !== undefined ? { status } : {}),
      });
      setRecords(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [services, status]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { records, loading, ...(error !== undefined ? { error } : {}), reload };
}
