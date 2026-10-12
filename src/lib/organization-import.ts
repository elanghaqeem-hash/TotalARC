export const ORGANIZATION_TYPES = ['Board / Committee', 'Directorate', 'Division', 'Department', 'Group', 'Function', 'Unit', 'Region', 'Branch', 'Office', 'Team'];
export type OrganizationDraft = {
  code: string; name: string; type: string; parentCode: string;
  headName: string; headEmail: string; source: string;
};

/** Shared strict validation: AI output and browser input are both untrusted. */
export function validateOrganizationDraft(value: unknown): OrganizationDraft[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error('Impor harus berisi 1–100 unit. Pisahkan struktur yang lebih besar.');
  const fields = { code: 80, name: 250, type: 40, parentCode: 80, headName: 200, headEmail: 254, source: 1000 };
  const rows = value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Unit ${index + 1} tidak valid.`);
    const row = {} as OrganizationDraft;
    for (const key of Object.keys(fields) as (keyof OrganizationDraft)[]) {
      const raw = item[key];
      if (raw != null && typeof raw !== 'string') throw new Error(`Field ${key} harus berupa teks.`);
      row[key] = (raw || '').trim();
      if (row[key].length > fields[key]) throw new Error(`Field ${key} terlalu panjang.`);
    }
    row.code = row.code.toUpperCase(); row.parentCode = row.parentCode.toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(row.code) || !row.name || !ORGANIZATION_TYPES.includes(row.type)) throw new Error(`Kode, nama, atau tipe unit ${index + 1} tidak valid.`);
    if (row.headEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.headEmail)) throw new Error(`Email unit ${row.code} tidak valid.`);
    if (!row.source) throw new Error(`Referensi sumber unit ${row.code} wajib diisi.`);
    return row;
  });
  const byCode = new Map(rows.map(row => [row.code, row]));
  if (byCode.size !== rows.length) throw new Error('Kode unit duplikat dalam hasil impor.');
  for (const row of rows) {
    const visited = new Set<string>();
    let cursor: OrganizationDraft | undefined = row;
    while (cursor) {
      if (visited.has(cursor.code)) throw new Error(`Hubungan induk berputar pada ${row.code}.`);
      visited.add(cursor.code); cursor = byCode.get(cursor.parentCode);
    }
  }
  return rows;
}

export function orderOrganizationDraft(rows: OrganizationDraft[], existing: {code: string; id: string}[]) {
  const known = new Set(existing.map(unit => unit.code.toUpperCase()));
  for (const row of rows) if (known.has(row.code)) throw new Error(`Kode ${row.code} sudah ada. Impor hanya menambah unit baru.`);
  const ordered: OrganizationDraft[] = [];
  const pending = [...rows];
  while (pending.length) {
    const index = pending.findIndex(row => !row.parentCode || known.has(row.parentCode));
    if (index < 0) throw new Error('Induk tidak ditemukan atau hubungan berputar. Periksa kode induk setiap unit.');
    const [row] = pending.splice(index, 1); ordered.push(row); known.add(row.code);
  }
  return ordered;
}
