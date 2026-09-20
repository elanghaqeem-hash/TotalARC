'use client';

import { useCallback, useEffect, useState } from 'react';

export function useAssuranceData() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/assurance', { cache: 'no-store' });
      if (!res.ok) throw new Error('Assurance data unavailable');
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assurance data unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}
