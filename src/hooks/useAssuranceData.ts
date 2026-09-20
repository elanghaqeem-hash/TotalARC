'use client';

import { useEffect, useState } from 'react';

let assuranceCache: any = null;
let assuranceRequest: Promise<any> | null = null;

function fetchAssuranceData(force = false) {
  if (force) assuranceCache = null;
  if (!assuranceRequest) {
    assuranceRequest = fetch('/api/assurance', { cache: 'no-store' })
      .then(res =>
        res.ok ? res.json() : Promise.reject(new Error('Assurance data unavailable'))
      )
      .then(payload => {
        assuranceCache = payload;
        return payload;
      })
      .finally(() => {
        assuranceRequest = null;
      });
  }

  return assuranceRequest;
}

export function useAssuranceData() {
  const [data, setData] = useState<any>(assuranceCache);
  const [loading, setLoading] = useState(assuranceCache === null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    if (assuranceCache !== null) {
      setData(assuranceCache);
      setLoading(false);
    }

    fetchAssuranceData()
      .then(payload => {
        if (!active) return;
        setData(payload);
        setError('');
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
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const payload = await fetchAssuranceData(true);
      setData(payload);
      setError('');
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
