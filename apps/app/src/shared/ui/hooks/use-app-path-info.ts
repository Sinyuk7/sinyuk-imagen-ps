import { useCallback, useEffect, useState } from 'react';
import type { AppPathInfo } from '../../ports/app-path-info';
import type { AppServices } from '../../ports/app-services';

export interface AppPathInfoState {
  readonly value: AppPathInfo | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
}

export function useAppPathInfo(services: AppServices): AppPathInfoState {
  const [value, setValue] = useState<AppPathInfo | null>(null);
  const [loading, setLoading] = useState(Boolean(services.pathInfo));
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!services.pathInfo) {
      setValue(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setValue(await services.pathInfo.getPathInfo());
      setError(null);
    } catch (nextError) {
      setValue(null);
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  }, [services.pathInfo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { value, loading, error, reload };
}
