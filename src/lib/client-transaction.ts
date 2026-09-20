'use client';

import { PERFORMANCE_STANDARDS, performanceNow } from '@/lib/performance';

type MutationMethod = 'POST' | 'PATCH';

export async function jsonTransaction<T = Record<string, unknown>>(
  url: string,
  body: unknown,
  method: MutationMethod = 'POST'
): Promise<T> {
  const startedAt = performanceNow();
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    PERFORMANCE_STANDARDS.clientHardTimeoutMs
  );

  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const payload = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || 'Transaction could not be completed.');
    }

    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(
        'Transaction exceeded the 8 second processing limit. Please retry; duplicate submission protection remains active.'
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    const durationMs = Math.round((performanceNow() - startedAt) * 10) / 10;
    const event = {
      event: 'totalarc.client-transaction',
      url,
      method,
      durationMs,
      budgetMs: PERFORMANCE_STANDARDS.mutationBudgetMs,
      withinBudget: durationMs <= PERFORMANCE_STANDARDS.mutationBudgetMs
    };

    if (durationMs > PERFORMANCE_STANDARDS.mutationBudgetMs) {
      console.warn(event);
    }
  }
}


export async function aiJsonTransaction<T = Record<string, unknown>>(
  url: string,
  body: unknown
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const payload = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || 'AI analysis could not be completed.');
    }

    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('AI analysis exceeded the 45 second interactive limit. Please retry.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
