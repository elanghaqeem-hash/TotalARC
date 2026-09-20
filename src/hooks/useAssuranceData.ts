'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PERFORMANCE_STANDARDS } from '@/lib/performance';

export type AssuranceModule =
  | 'institution'
  | 'organization'
  | 'controls'
  | 'rcsa'
  | 'tod'
  | 'icofr'
  | 'toe'
  | 'remediation'
  | 'certification'
  | 'tasks'
  | 'calendar';

type CacheEntry = {
  data: any;
  cachedAt: number;
};

const assuranceCache = new Map<string, CacheEntry>();
const assuranceInflight = new Map<string, Promise<any>>();

function cacheKey(modules: AssuranceModule[]) {
  return modules.length ? [...modules].sort().join(',') : 'all';
}

function endpointFor(modules: AssuranceModule[]) {
  if (!modules.length) return '/api/assurance';
  return '/api/assurance?modules=' + encodeURIComponent([...modules].sort().join(','));
}

async function fetchAssuranceData(key: string, endpoint: string, force: boolean) {
  const cached = assuranceCache.get(key);
  const cacheFresh =
    cached
    && Date.now() - cached.cachedAt < PERFORMANCE_STANDARDS.clientCacheTtlMs;

  if (!force && cacheFresh) return cached.data;

  const existing = assuranceInflight.get(key);
  if (existing) return existing;

  const request = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      PERFORMANCE_STANDARDS.clientHardTimeoutMs
    );

    try {
      const response = await fetch(endpoint, {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error('Assurance data unavailable');
      }

      const data = await response.json();
      assuranceCache.set(key, { data, cachedAt: Date.now() });
      return data;
    } finally {
      window.clearTimeout(timeout);
      assuranceInflight.delete(key);
    }
  })();

  assuranceInflight.set(key, request);
  return request;
}

export function useAssuranceData(modules: AssuranceModule[] = []) {
  const key = useMemo(() => cacheKey(modules), [modules]);
  const endpoint = useMemo(() => endpointFor(modules), [modules]);
  const cached = assuranceCache.get(key);

  const [data, setData] = useState<any>(cached?.data || null);
  const [loading, setLoading] = useState(!cached?.data);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (force: boolean) => {
    const hasData = Boolean(assuranceCache.get(key)?.data || data);
    if (hasData) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const next = await fetchAssuranceData(key, endpoint, force);
      setData(next);
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      setError(
        aborted
          ? 'Data loading exceeded the 8 second transaction limit. Please retry.'
          : err instanceof Error
            ? err.message
            : 'Assurance data unavailable'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [data, endpoint, key]);

  const reload = useCallback(async () => {
    await load(true);
  }, [load]);

  useEffect(() => {
    const nextCached = assuranceCache.get(key);
    if (nextCached?.data) {
      setData(nextCached.data);
      setLoading(false);
    } else {
      setData(null);
    }
    void load(false);
  }, [key, load]);

  return { data, loading, refreshing, error, reload };
}
