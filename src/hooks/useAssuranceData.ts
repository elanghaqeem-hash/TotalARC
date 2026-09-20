'use client';

import { useEffect, useMemo, useState } from 'react';

const ASSURANCE_CACHE_TTL_MS = 30_000;

type CacheEntry = {
  payload: any;
  updatedAt: number;
};

const assuranceCache = new Map<string, CacheEntry>();
const assuranceRequests = new Map<string, Promise<any>>();

function normalizeSections(sections?: string[]) {
  const list = (sections?.length ? sections : ['integration'])
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(list)).sort();
}

function cacheKeyFor(sections?: string[]) {
  return normalizeSections(sections).join(',');
}

function cacheIsFresh(key: string) {
  const entry = assuranceCache.get(key);
  return Boolean(entry && Date.now() - entry.updatedAt < ASSURANCE_CACHE_TTL_MS);
}

function fetchAssuranceData(sections?: string[], force = false) {
  const normalized = normalizeSections(sections);
  const key = normalized.join(',');
  const cached = assuranceCache.get(key);

  if (!force && cacheIsFresh(key) && cached) {
    return Promise.resolve(cached.payload);
  }

  const existing = assuranceRequests.get(key);
  if (existing) return existing;

  const query = new URLSearchParams({ sections: normalized.join(',') });
  const request = fetch('/api/assurance?' + query.toString(), {
    cache: force ? 'no-store' : 'default',
    headers: { 'x-totalarc-client-cache': force ? 'refresh' : 'warm' }
  })
    .then(async res => {
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Assurance data unavailable');
      }
      return payload;
    })
    .then(payload => {
      assuranceCache.set(key, { payload, updatedAt: Date.now() });
      return payload;
    })
    .finally(() => {
      assuranceRequests.delete(key);
    });

  assuranceRequests.set(key, request);
  return request;
}

export function useAssuranceData(sections?: string[]) {
  const normalizedSections = useMemo(
    () => normalizeSections(sections),
    [JSON.stringify(sections || ['integration'])]
  );
  const cacheKey = normalizedSections.join(',');
  const cached = assuranceCache.get(cacheKey)?.payload ?? null;

  const [data, setData] = useState<any>(cached);
  const [loading, setLoading] = useState(cached === null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const latestCached = assuranceCache.get(cacheKey)?.payload ?? null;

    if (latestCached !== null) {
      setData(latestCached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    fetchAssuranceData(normalizedSections)
      .then(payload => {
        if (!active) return;
        setData(payload);
        setError(
          payload?.dataStatus === 'degraded'
            ? 'Some assurance modules could not be loaded. Displayed data may be incomplete.'
            : ''
        );
      })
      .catch(err => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Assurance data unavailable');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [cacheKey]);

  const refresh = async () => {
    if (data === null) setLoading(true);
    try {
      const payload = await fetchAssuranceData(normalizedSections, true);
      setData(payload);
      setError(
        payload?.dataStatus === 'degraded'
          ? 'Some assurance modules could not be loaded. Displayed data may be incomplete.'
          : ''
      );
      return payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assurance data unavailable');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, error, refresh };
}
