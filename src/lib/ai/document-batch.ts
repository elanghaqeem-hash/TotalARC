import type { ProcessDocumentDraft } from '@/lib/d1-process-document-analysis';

const DEFAULT_CHUNK_CHARS = 85_000;
const DEFAULT_MAX_CHUNKS = 16;

function compactKey(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9À-ɏ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function joinDistinct(a: string | null | undefined, b: string | null | undefined, max: number) {
  const left = String(a || '').trim();
  const right = String(b || '').trim();
  if (!left) return right ? right.slice(0, max) : null;
  if (!right) return left.slice(0, max);
  if (compactKey(left) === compactKey(right)) return left.slice(0, max);
  return (left + ' | ' + right).slice(0, max);
}

function unionStrings(a: string[] = [], b: string[] = [], maxItems = 20) {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const value of [...a, ...b]) {
    const text = String(value || '').trim();
    const key = compactKey(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    merged.push(text);
    if (merged.length >= maxItems) break;
  }
  return merged;
}

export function sourceChunks(
  extracted: { text: string; chunks?: string[] },
  maxChars = DEFAULT_CHUNK_CHARS,
  maxChunks = DEFAULT_MAX_CHUNKS
) {
  const supplied = Array.isArray(extracted.chunks)
    ? extracted.chunks.map(value => String(value || '').trim()).filter(Boolean)
    : [];
  if (supplied.length > maxChunks) {
    throw new Error('DOCUMENT_SOURCE_TOO_LARGE_FOR_COMPLETE_ANALYSIS');
  }
  if (supplied.length) return supplied;

  const value = String(extracted.text || '').trim();
  if (!value) return [];
  if (value.length <= maxChars) return [value];

  const chunks: string[] = [];
  let remaining = value;
  while (remaining.length && chunks.length < maxChunks) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      remaining = '';
      break;
    }

    let cut = remaining.lastIndexOf('\n--- Halaman ', maxChars);
    if (cut < Math.floor(maxChars * 0.55)) {
      cut = remaining.lastIndexOf('\n\n', maxChars);
    }
    if (cut < Math.floor(maxChars * 0.55)) cut = maxChars;

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) {
    throw new Error('DOCUMENT_SOURCE_TOO_LARGE_FOR_COMPLETE_ANALYSIS');
  }
  return chunks.filter(Boolean);
}

export function mergeProcessDocumentDrafts(
  base: ProcessDocumentDraft,
  incoming: ProcessDocumentDraft
): ProcessDocumentDraft {
  const activities = [...(base.activities || [])];
  const seen = new Set(
    activities.map(item =>
      [
        compactKey(item.name),
        compactKey(item.performer),
        compactKey(item.systemUsed)
      ].join('::')
    )
  );

  for (const item of incoming.activities || []) {
    const key = [
      compactKey(item.name),
      compactKey(item.performer),
      compactKey(item.systemUsed)
    ].join('::');
    if (seen.has(key)) continue;
    seen.add(key);
    activities.push(item);
    if (activities.length >= 60) break;
  }

  const confidenceRank: Record<ProcessDocumentDraft['confidence'], number> = {
    High: 3,
    Medium: 2,
    Low: 1
  };
  const confidence =
    confidenceRank[base.confidence] <= confidenceRank[incoming.confidence]
      ? base.confidence
      : incoming.confidence;

  return {
    master: {
      name: base.master.name || incoming.master.name,
      description: joinDistinct(base.master.description, incoming.master.description, 2500),
      ownerName: base.master.ownerName || incoming.master.ownerName,
      categorySuggestion: base.master.categorySuggestion || incoming.master.categorySuggestion,
      criticality: base.master.criticality || incoming.master.criticality,
      classification: base.master.classification || incoming.master.classification,
      isIcofrRelevant:
        base.master.isIcofrRelevant === null
          ? incoming.master.isIcofrRelevant
          : base.master.isIcofrRelevant
    },
    objective:
      base.objective || incoming.objective
        ? {
            objective:
              joinDistinct(base.objective?.objective, incoming.objective?.objective, 1200) || '',
            strategicGoal: joinDistinct(
              base.objective?.strategicGoal,
              incoming.objective?.strategicGoal,
              1000
            ),
            expectedOutcome: joinDistinct(
              base.objective?.expectedOutcome,
              incoming.objective?.expectedOutcome,
              1000
            ),
            kpi: joinDistinct(base.objective?.kpi, incoming.objective?.kpi, 800),
            kri: joinDistinct(base.objective?.kri, incoming.objective?.kri, 800),
            sla: joinDistinct(base.objective?.sla, incoming.objective?.sla, 500)
          }
        : null,
    sipoc:
      base.sipoc || incoming.sipoc
        ? {
            suppliers: joinDistinct(base.sipoc?.suppliers, incoming.sipoc?.suppliers, 1600),
            inputs: joinDistinct(base.sipoc?.inputs, incoming.sipoc?.inputs, 1600),
            processSteps: joinDistinct(
              base.sipoc?.processSteps,
              incoming.sipoc?.processSteps,
              2200
            ),
            outputs: joinDistinct(base.sipoc?.outputs, incoming.sipoc?.outputs, 1600),
            customers: joinDistinct(base.sipoc?.customers, incoming.sipoc?.customers, 1600)
          }
        : null,
    activities: activities.map((item, index) => ({
      ...item,
      activityId: item.activityId || 'AI-DOC-' + String(index + 1).padStart(3, '0'),
      orderIndex: index + 1
    })),
    sourceSummary:
      joinDistinct(base.sourceSummary, incoming.sourceSummary, 2200) ||
      'AI draft derived from uploaded supporting documents.',
    confidence,
    assumptions: unionStrings(base.assumptions, incoming.assumptions, 20),
    gaps: unionStrings(base.gaps, incoming.gaps, 30)
  };
}

export function summarizeAiRequests(
  results: Array<{ provider: string; model: string; requestId: string }>
) {
  const first = results[0];
  return {
    provider: first?.provider || 'unknown',
    model: first?.model || 'unknown',
    requestId: results.map(item => item.requestId).filter(Boolean).join(',').slice(0, 1800)
  };
}
