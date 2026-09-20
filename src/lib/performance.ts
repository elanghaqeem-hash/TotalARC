export const PERFORMANCE_STANDARDS = {
  focusedReadBudgetMs: 1200,
  aggregateReadBudgetMs: 2000,
  mutationBudgetMs: 1500,
  clientHardTimeoutMs: 8000,
  clientCacheTtlMs: 15000,
  authActivityWriteIntervalMs: 300000
} as const;

export type PerformanceBudgetKind =
  | 'focused-read'
  | 'aggregate-read'
  | 'mutation';

export function performanceBudgetMs(kind: PerformanceBudgetKind) {
  if (kind === 'mutation') return PERFORMANCE_STANDARDS.mutationBudgetMs;
  if (kind === 'aggregate-read') return PERFORMANCE_STANDARDS.aggregateReadBudgetMs;
  return PERFORMANCE_STANDARDS.focusedReadBudgetMs;
}

export function performanceNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export function recordApiPerformance(
  operation: string,
  startedAt: number,
  kind: PerformanceBudgetKind
) {
  const durationMs = Math.round((performanceNow() - startedAt) * 10) / 10;
  const budgetMs = performanceBudgetMs(kind);
  const event = {
    event: 'totalarc.performance',
    operation,
    durationMs,
    budgetMs,
    withinBudget: durationMs <= budgetMs
  };

  if (durationMs > budgetMs) {
    console.warn(JSON.stringify(event));
  } else {
    console.info(JSON.stringify(event));
  }

  return event;
}
