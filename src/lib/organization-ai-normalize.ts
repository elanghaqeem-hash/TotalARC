import { ORGANIZATION_TYPES, validateOrganizationDraft, type OrganizationDraft } from './organization-import';

const TYPE_ALIASES: Record<string, string> = {
  'board': 'Board / Committee', 'committee': 'Board / Committee',
  'dewan komisaris': 'Board / Committee', 'komite': 'Board / Committee',
  'direksi': 'Directorate', 'direktur': 'Directorate',
  'direktorat': 'Directorate', 'directorate': 'Directorate',
  'divisi': 'Division', 'division': 'Division',
  'departemen': 'Department', 'department': 'Department',
  'grup': 'Group', 'group': 'Group',
  'fungsi': 'Function', 'function': 'Function',
  'unit': 'Unit', 'satuan kerja': 'Unit',
  'wilayah': 'Region', 'region': 'Region', 'regional': 'Region',
  'cabang': 'Branch', 'kantor cabang': 'Branch', 'branch': 'Branch',
  'kantor': 'Office', 'office': 'Office',
  'tim': 'Team', 'team': 'Team'
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function code(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function sourceFromDocument(name: string, documentText: string): string | null {
  if (name.length < 5) return null;
  const lower = documentText.toLocaleLowerCase('id');
  const index = lower.indexOf(name.toLocaleLowerCase('id'));
  if (index < 0) return null;
  const before = documentText.slice(0, index);
  const labels = [...before.matchAll(/--- (?:Halaman|Gambar halaman) (\d+) ---/gi)];
  const page = labels.length ? labels[labels.length - 1][1] : '';
  if (!page) return null;
  // This is an evidence locator, not a claim that a reporting line is confirmed.
  return 'Halaman ' + page + ': ' + name;
}

/**
 * Repair mechanical AI formatting only. Never infer an organization node, leader,
 * or parent relationship from a hierarchy convention. Missing evidence still fails.
 */
export function normalizeOrganizationAiDraft(value: unknown, documentText: string): {
  units: OrganizationDraft[];
  warnings: string[];
} {
  if (!Array.isArray(value) || value.length > 100) {
    throw new Error('Impor harus berisi maksimal 100 unit per bagian.');
  }
  if (!value.length) return { units: [], warnings: [] };
  const warnings: string[] = [];
  const units: OrganizationDraft[] = [];
  const codes = new Map<string, OrganizationDraft>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Unit hasil AI harus berupa objek.');
    }
    const candidate = item as Record<string, unknown>;
    const name = text(candidate.name);
    if (!name) throw new Error('Unit tanpa nama tidak dapat diterima.');
    const rawType = text(candidate.type);
    const type = ORGANIZATION_TYPES.find(t => t.toLowerCase() === rawType.toLowerCase()) ||
      TYPE_ALIASES[rawType.toLocaleLowerCase('id')];
    if (!type) throw new Error('Tipe unit hasil AI tidak dikenal.');
    let unitCode = code(text(candidate.code));
    if (!unitCode) {
      unitCode = ('AI-' + code(name)).slice(0, 80);
      if (!unitCode || unitCode === 'AI-') throw new Error('Kode unit tidak dapat dibentuk.');
      warnings.push('Kode teknis ' + unitCode + ' dibuat dari nama; verifikasi sebelum menyimpan.');
    } else if (unitCode !== text(candidate.code).toUpperCase()) {
      warnings.push('Format kode ' + text(candidate.code).slice(0, 80) + ' dinormalisasi menjadi ' + unitCode + '.');
    }
    const providedSource = text(candidate.source);
    const source = providedSource || sourceFromDocument(name, documentText);
    if (!source) throw new Error('Referensi sumber untuk unit ' + unitCode + ' tidak dapat dibuktikan.');
    if (!providedSource) {
      warnings.push('Referensi halaman ' + unitCode + ' ditemukan dari teks; cocokkan dengan dokumen asli.');
    }
    const parentCode = code(text(candidate.parentCode));
    const email = text(candidate.headEmail);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      warnings.push('Email pimpinan ' + unitCode + ' tidak valid dan dikosongkan.');
    }
    const row: OrganizationDraft = {
      code: unitCode, name, type, parentCode, headName: text(candidate.headName),
      headEmail: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
      source: source.slice(0, 1000)
    };
    const duplicate = codes.get(row.code);
    if (duplicate && duplicate.name.toLocaleLowerCase('id') === row.name.toLocaleLowerCase('id')) {
      if (!duplicate.source.includes(row.source)) {
        duplicate.source = (duplicate.source + ' | ' + row.source).slice(0, 1000);
      }
      if (duplicate.parentCode !== row.parentCode) {
        duplicate.parentCode = '';
        warnings.push('Hubungan induk unit ' + row.code + ' berbeda pada hasil AI; harus ditetapkan pengguna.');
      }
      continue;
    }
    if (duplicate) {
      const base = unitCode.slice(0, 76);
      let suffix = 2;
      while (codes.has(base + '-' + suffix)) suffix++;
      row.code = base + '-' + suffix;
      row.parentCode = '';
      warnings.push('Kode ' + unitCode + ' dipakai beberapa unit berbeda. Kode sementara ' + row.code + ' memerlukan pemeriksaan induk.');
    }
    codes.set(row.code, row);
    units.push(row);
  }
  // The shared validator also rejects cycles, oversized fields and invalid codes.
  return { units: validateOrganizationDraft(units), warnings };
}
