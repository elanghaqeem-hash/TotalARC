'use client';

import { PERFORMANCE_STANDARDS, performanceNow } from '@/lib/performance';

const inflightReads = new Map<string, Promise<any>>();

export async function jsonRead<T = Record<string, unknown>>(
  url: string,
  options: { dedupe?: boolean } = {}
): Promise<T> {
  const dedupe = options.dedupe !== false;
  if (dedupe) {
    const existing = inflightReads.get(url);
    if (existing) return existing as Promise<T>;
  }

  const request = (async () => {
    const startedAt = performanceNow();
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      PERFORMANCE_STANDARDS.clientHardTimeoutMs
    );

    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal
      });
      const payload = (await response.json()) as T & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Data could not be loaded.');
      }
      return payload;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(
          'Data loading exceeded the 8 second request limit. Please retry.'
        );
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
      inflightReads.delete(url);

      const durationMs = Math.round((performanceNow() - startedAt) * 10) / 10;
      if (durationMs > PERFORMANCE_STANDARDS.focusedReadBudgetMs) {
        console.warn({
          event: 'totalarc.client-read',
          url,
          durationMs,
          budgetMs: PERFORMANCE_STANDARDS.focusedReadBudgetMs,
          withinBudget: false
        });
      }
    }
  })();

  if (dedupe) inflightReads.set(url, request);
  return request;
}
