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


/** Display guidance only; actual reporting lines must come from an approved bank source. */
export const ORGANIZATION_HIERARCHY_STANDARD =
  'Dewan Komisaris/Komite (pengawasan, bukan otomatis atasan Direksi) → Direksi/Direktorat → Divisi → Departemen/Grup → Fungsi/Unit → Wilayah → Cabang → Kantor/Tim. Ikuti hubungan parent-child pada dokumen bank bila berbeda.';
const ORGANIZATION_TYPE_ORDER: Record<string, number> = {
  'Board / Committee': 0, Directorate: 1, Division: 2, Department: 3,
  Group: 4, Function: 5, Unit: 6, Region: 7, Branch: 8, Office: 9, Team: 10
};

/** Split OCR by page boundaries before the gateway's input/output token limits are reached. */
export function splitOrganizationDocumentText(text: string, maxChars = 12_000): string[] {
  if (!text.trim() || text.length > 90_000 || maxChars < 200) {
    throw new Error('Teks dokumen kosong, terlalu besar, atau ukuran bagian tidak valid.');
  }
  const sections = text.trim().split(/(?=--- (?:Halaman|Gambar halaman) \d+ ---)/i).filter(Boolean);
  const pieces: string[] = [];
  for (const section of sections) {
    const page = section.match(/^--- (?:Halaman|Gambar halaman) \d+ ---/i)?.[0] || '';
    let rest = section.trim();
    while (rest.length > maxChars) {
      const min = Math.floor(maxChars * 0.6);
      let cut = rest.lastIndexOf('\n', maxChars);
      if (cut < min) cut = maxChars;
      pieces.push(rest.slice(0, cut).trim());
      rest = (page && !rest.slice(cut).trimStart().startsWith('---') ? page + '\n' : '') +
        rest.slice(cut).trim();
    }
    if (rest.trim()) pieces.push(rest.trim());
  }
  const chunks: string[] = [];
  for (const piece of pieces) {
    const last = chunks.length - 1;
    if (last >= 0 && (chunks[last].length + piece.length + 2 <= maxChars || piece.length < 50)) {
      chunks[last] += '\n\n' + piece;
    } else {
      chunks.push(piece);
    }
  }
  if (chunks.length > 20) {
    throw new Error('Dokumen memerlukan lebih dari 20 tahap analisis. Pisahkan lampiran organisasi dari SK.');
  }
  return chunks;
}

/** Conservative merging: never overwrite nonidentical units or infer a parent. */
export function mergeOrganizationDrafts(groups: OrganizationDraft[][]): {
  units: OrganizationDraft[]; warnings: string[];
} {
  const units: OrganizationDraft[] = [];
  const byCode = new Map<string, OrganizationDraft>();
  const warnings: string[] = [];
  for (const group of groups) {
    for (const item of group) {
      const row = {...item};
      const current = byCode.get(row.code);
      if (current && current.name.toLocaleLowerCase('id') === row.name.toLocaleLowerCase('id')) {
        if (row.source && !current.source.includes(row.source)) {
          current.source = (current.source + ' | ' + row.source).slice(0, 1000);
        }
        if (!current.parentCode && row.parentCode) {
          // Do not infer a previously unknown reporting line from a separate OCR chunk.
          warnings.push('Periksa induk unit ' + row.name + ': muncul pada beberapa bagian.');
        }
        continue;
      }
      if (current) {
        const oldCode = row.code;
        let index = 2;
        while (byCode.has(oldCode + '-' + index)) index++;
        row.code = oldCode + '-' + index;
        // Any parent linking the old code is ambiguous until a human resolves it.
        row.parentCode = '';
        warnings.push('Kode unit ' + oldCode + ' dipakai beberapa nama. Kode sementara ' +
          row.code + ' perlu diverifikasi sebelum disimpan.');
      }
      byCode.set(row.code, row);
      units.push(row);
      if (units.length > 100) {
        throw new Error('Ditemukan lebih dari 100 unit. Pisahkan impor sesuai direktorat/cabang; tidak ada data yang disimpan.');
      }
    }
  }
  // Parent-first where possible, then canonical organizational type ordering.
  const order = new Map(units.map((unit, index) => [unit.code, index]));
  const depth = (row: OrganizationDraft) => {
    let steps = 0;
    let current = row;
    const seen = new Set<string>();
    while (current.parentCode && order.has(current.parentCode) && steps < 100) {
      if (seen.has(current.code)) break;
      seen.add(current.code);
      current = units[order.get(current.parentCode)!];
      steps++;
    }
    return steps;
  };
  return {
    units: units.sort((a, b) => depth(a) - depth(b) ||
      (ORGANIZATION_TYPE_ORDER[a.type] ?? 50) - (ORGANIZATION_TYPE_ORDER[b.type] ?? 50) ||
      a.name.localeCompare(b.name, 'id')),
    warnings
  };
}
