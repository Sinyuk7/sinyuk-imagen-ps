import { useCallback, useEffect, useState } from 'react';
import type { TaskRecord } from '@imagen-ps/application';
import type { AppServices } from '../../ports/app-services';

type JobHistoryStatus = TaskRecord['status'];

export interface JobHistoryState {
  readonly records: readonly TaskRecord[];
  readonly loading: boolean;
  readonly error?: string;
  readonly reload: () => Promise<void>;
}

/** 从 application durable task command 读取 product history。 */
export function useJobHistory(services: AppServices, status?: JobHistoryStatus): JobHistoryState {
  const [records, setRecords] = useState<readonly TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const next = await services.commands.listTaskRecords({
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
