'use client';

import { useEffect, useState } from 'react';

export function useAssuranceData() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/assurance')
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('Assurance data unavailable')))
      .then((payload) => setData(payload))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}
