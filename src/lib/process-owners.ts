export type ProcessOwnerUnit = { id: string; code: string; name: string; type: string; parentId: string | null };

export function parseStoredOwnerIds(value: unknown): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  try { const ids = JSON.parse(value); return Array.isArray(ids) && ids.every(id => typeof id === 'string') ? ids : undefined; }
  catch { return undefined; }
}

export function validateOwnerIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 99 || value.some(id => typeof id !== 'string' || !id.trim() || id.length > 200)) {
    throw new Error('PROCESS_OWNERS_INVALID');
  }
  return Array.from(new Set<string>(value.map(id => id.trim())));
}

export function resolveOwnerNames(ids: string[], units: ProcessOwnerUnit[]) {
  const byId = new Map(units.map(unit => [unit.id, unit]));
  if (ids.some(id => !byId.has(id))) throw new Error('PROCESS_OWNER_UNIT_NOT_FOUND');
  return ids.map(id => byId.get(id)!.name).join('; ');
}
