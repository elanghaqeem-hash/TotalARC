export type PolicyDocumentKind = 'policy' | 'regulation';
export const POLICY_AI_FIELDS = {
  policy: ['documentCode', 'documentType', 'title', 'ownerUnit', 'ownerName', 'version', 'issueDate', 'effectiveDate', 'nextReviewDate', 'reviewCycleMonths', 'scope', 'summary'],
  regulation: ['regulator', 'regulationCode', 'title', 'category', 'issueDate', 'effectiveDate', 'summary']
} as const;
export function cleanPolicyDraft(value: unknown, kind: PolicyDocumentKind): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_AI_DRAFT');
  const draft: Record<string, string> = {};
  for (const key of POLICY_AI_FIELDS[kind]) {
    const input = (value as Record<string, unknown>)[key];
    if (typeof input !== 'string' || !input.trim()) continue;
    const text = input.trim();
    if (/Date$/.test(key) && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text)) || new Date(text).toISOString().slice(0,10) !== text)) continue;
    if (key === 'documentType' && !['Kebijakan','SOP','Pedoman','Buku Pedoman Perusahaan','Piagam','Petunjuk Teknis','Peraturan Direksi','Surat Edaran','Keputusan','Prosedur','Instruksi Kerja','Standar','Ketentuan Internal'].includes(text)) continue;
    if (key === 'reviewCycleMonths') {
      if (!/^\d{1,3}$/.test(text)) continue;
      const months = Number(text);
      if (months < 1 || months > 120) continue;
      draft[key] = String(months);
      continue;
    }
    draft[key] = text.slice(0, key === 'summary' ? 10000 : key === 'scope' ? 3000 : 500);
  }
  if (!Object.keys(draft).length) throw new Error('INVALID_AI_DRAFT');
  return draft;
}
