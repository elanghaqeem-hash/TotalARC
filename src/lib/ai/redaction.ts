export type BankingRedactionCategory =
  | 'EMAIL'
  | 'PHONE'
  | 'CARD_NUMBER'
  | 'NIK'
  | 'NPWP'
  | 'CIF'
  | 'BANK_ACCOUNT'
  | 'LOAN_ACCOUNT'
  | 'EMPLOYEE_ID'
  | 'CONFIDENTIAL_DOCUMENT_METADATA'
  | 'API_KEY'
  | 'BEARER_TOKEN'
  | 'SECRET';

export type BankingRedactionResult = {
  text: string;
  redactions: number;
  categories: Partial<Record<BankingRedactionCategory, number>>;
};

export type BankingRedactionMethod =
  | 'STRUCTURED_FIELD'
  | 'CONTEXT_CLASSIFIER'
  | 'CHECKSUM_VALIDATOR'
  | 'FORMAT_VALIDATOR'
  | 'SECRET_PATTERN';

export type BankingRedactionDetection = {
  category: BankingRedactionCategory;
  method: BankingRedactionMethod;
  confidence: 'HIGH' | 'MEDIUM';
};

type ClassifiedField = {
  category: BankingRedactionCategory;
  confidence: 'HIGH' | 'MEDIUM';
};

const FIELD_ALIASES: Array<{ category: BankingRedactionCategory; aliases: string[] }> = [
  { category: 'CIF', aliases: ['cif','customer cif','customer id','customer number','customer information file','nomor cif','no cif','id nasabah','nomor nasabah'] },
  { category: 'BANK_ACCOUNT', aliases: ['rekening','nomor rekening','no rekening','account number','account no','bank account','bank account number','nomor akun bank'] },
  { category: 'CARD_NUMBER', aliases: ['card number','card no','nomor kartu','no kartu','pan','primary account number'] },
  { category: 'NIK', aliases: ['nik','no nik','nomor nik','nomor induk kependudukan','id kependudukan'] },
  { category: 'NPWP', aliases: ['npwp','no npwp','nomor npwp','tax id','taxpayer id'] },
  { category: 'LOAN_ACCOUNT', aliases: ['loan account','loan account number','loan number','loan no','loan id','credit account','credit account number','credit number','credit no','credit id','nomor kredit','no kredit','nomor pinjaman','no pinjaman','nomor fasilitas','no fasilitas'] },
  { category: 'EMPLOYEE_ID', aliases: ['employee id','internal employee id','personnel number','employee number','nip','nik pegawai','id pegawai','nomor pegawai'] },
  { category: 'CONFIDENTIAL_DOCUMENT_METADATA', aliases: ['document id','document number','document no','document reference','document metadata','document filename','filename','file name','nomor dokumen','no dokumen','referensi dokumen','nama file','evidence file','evidence filename','workpaper reference','working paper reference','confidential document metadata'] }
];

function normalizeFieldName(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_./\\-]+/g, ' ')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function classifyBankingSensitiveField(fieldName: string): ClassifiedField | null {
  const normalized = normalizeFieldName(fieldName);
  if (!normalized) return null;

  for (const rule of FIELD_ALIASES) {
    if (rule.aliases.includes(normalized)) {
      return { category: rule.category, confidence: 'HIGH' };
    }
  }

  for (const rule of FIELD_ALIASES) {
    if (rule.aliases.some(alias =>
      normalized.length >= 5 &&
      (normalized.endsWith(' ' + alias) || normalized.startsWith(alias + ' '))
    )) {
      return { category: rule.category, confidence: 'MEDIUM' };
    }
  }

  return null;
}

function luhnValid(candidate: string) {
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function validCalendarDate(day: number, month: number) {
  if (day < 1 || day > 31 || month < 1 || month > 12) return false;
  const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= maxDay;
}

function plausibleNik(candidate: string) {
  if (!/^\d{16}$/.test(candidate)) return false;
  const region = candidate.slice(0, 6);
  const day = Number(candidate.slice(6, 8));
  const normalizedDay = day > 40 ? day - 40 : day;
  const month = Number(candidate.slice(8, 10));
  const serial = candidate.slice(12, 16);

  if (/^0{6}$/.test(region) || serial === '0000') return false;
  return validCalendarDate(normalizedDay, month);
}

function plausibleNpwp(candidate: string) {
  const digits = candidate.replace(/\D/g, '');
  return digits.length === 15 || digits.length === 16;
}

function replacementFor(category: BankingRedactionCategory) {
  return '[' + category + '_REDACTED]';
}

function redactStructuredValue(value: unknown, category: BankingRedactionCategory): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map(item =>
      item === null || item === undefined ? item : replacementFor(category)
    );
  }
  return replacementFor(category);
}

function redactStructuredJson(
  value: string,
  onRedaction: (category: BankingRedactionCategory) => void
): string | null {
  const trimmed = value.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (!node || typeof node !== 'object') return node;

    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      const classified = classifyBankingSensitiveField(key);
      if (classified) {
        output[key] = redactStructuredValue(child, classified.category);
        onRedaction(classified.category);
      } else {
        output[key] = visit(child);
      }
    }
    return output;
  };

  return JSON.stringify(visit(parsed));
}

function redactContextKeyValues(
  value: string,
  onRedaction: (category: BankingRedactionCategory) => void
) {
  return value
    .split('\n')
    .map(line => {
      const separators = [line.indexOf(':'), line.indexOf('=')]
        .filter(index => index > 0)
        .sort((a, b) => a - b);

      if (separators.length === 0) return line;

      const index = separators[0];
      const label = line.slice(0, index).replace(/^\s*[-*•]\s*/, '').trim();
      const classified = classifyBankingSensitiveField(label);
      const rawValue = line.slice(index + 1).trim();

      if (!classified || !rawValue || /^\[[A-Z_]+_REDACTED\]$/.test(rawValue)) {
        return line;
      }

      const candidate = rawValue.replace(/^["']|["'],?$/g, '').trim();

      if (classified.category === 'CARD_NUMBER' && !luhnValid(candidate)) return line;
      if (
        classified.category === 'NIK' &&
        !plausibleNik(candidate.replace(/\D/g, ''))
      ) {
        return line;
      }
      if (classified.category === 'NPWP' && !plausibleNpwp(candidate)) return line;

      onRedaction(classified.category);
      return line.slice(0, index + 1) + ' ' + replacementFor(classified.category);
    })
    .join('\n');
}

function addCount(
  categories: Partial<Record<BankingRedactionCategory, number>>,
  category: BankingRedactionCategory
) {
  categories[category] = (categories[category] || 0) + 1;
}

export function redactBankingSensitiveData(value: string): BankingRedactionResult {
  let text = value;
  const categories: Partial<Record<BankingRedactionCategory, number>> = {};

  const record = (category: BankingRedactionCategory) => {
    addCount(categories, category);
  };

  const structured = redactStructuredJson(text, record);
  if (structured !== null) text = structured;

  // Second layer: semantic field classification for free-form key/value text.
  // This covers bank identifiers even when their labels vary and reduces
  // reliance on a single family of regexes.
  text = redactContextKeyValues(text, record);

  const replace = (
    pattern: RegExp,
    category: BankingRedactionCategory,
    replacement?: (match: string, ...groups: string[]) => string
  ) => {
    text = text.replace(pattern, (...args: unknown[]) => {
      const match = String(args[0] || '');
      if (/\[[A-Z_]+_REDACTED\]/.test(match)) return match;
      record(category);
      const groups = args.slice(1, -2).map(item => String(item ?? ''));
      return replacement ? replacement(match, ...groups) : replacementFor(category);
    });
  };

  replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, 'EMAIL');
  replace(/(?:\+62|62|0)8\d{7,12}\b/g, 'PHONE');
  replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, 'API_KEY');
  replace(/\bsk-[0-9A-Za-z_-]{16,}\b/g, 'API_KEY');
  replace(/\bBearer\s+[0-9A-Za-z._~-]{12,}\b/gi, 'BEARER_TOKEN');
  replace(
    /\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
    'SECRET'
  );

  text = text.replace(/\b(?:\d[ -]?){13,19}\d?\b/g, candidate => {
    const digits = candidate.replace(/\D/g, '');
    if (!luhnValid(digits)) return candidate;
    record('CARD_NUMBER');
    return replacementFor('CARD_NUMBER');
  });

  replace(
    /\b(?:nik|no\.?\s*nik|nomor\s+induk\s+kependudukan)\s*[:=#-]?\s*(\d{16})\b/gi,
    'NIK'
  );
  text = text.replace(/\b\d{16}\b/g, candidate => {
    if (!plausibleNik(candidate)) return candidate;
    record('NIK');
    return replacementFor('NIK');
  });

  text = text.replace(
    /\b(?:npwp|no\.?\s*npwp|nomor\s+npwp)\s*[:=#-]?\s*([0-9.\-]{15,24})\b/gi,
    match => {
      const candidate = match.split(/[:=#]/).pop()?.trim() || '';
      if (!plausibleNpwp(candidate)) return match;
      record('NPWP');
      return replacementFor('NPWP');
    }
  );

  replace(
    /\b(?:cif|customer\s+(?:information\s+file|id)|nomor\s+cif|no\.?\s*cif)\s*[:=#-]?\s*([A-Z0-9][A-Z0-9._\/-]{3,31})/gi,
    'CIF'
  );

  replace(
    /\b(?:nomor\s+rekening|no\.?\s*rekening|rekening|account\s+(?:number|no\.?))\s*[:=#-]?\s*([0-9][0-9 .\/-]{5,24})/gi,
    'BANK_ACCOUNT'
  );

  replace(
    /\b(?:loan\s+(?:account|number|no\.?|id)|credit\s+(?:account|number|no\.?|id)|nomor\s+(?:kredit|pinjaman|fasilitas)|no\.?\s+(?:kredit|pinjaman|fasilitas))\s*[:=#-]?\s*([A-Z0-9][A-Z0-9._\/-]{3,31})/gi,
    'LOAN_ACCOUNT'
  );

  replace(
    /\b(?:employee\s+id|internal\s+employee\s+id|personnel\s+number|nip|nik\s+pegawai|id\s+pegawai|nomor\s+pegawai)\s*[:=#-]?\s*([A-Z0-9][A-Z0-9._\/-]{2,31})/gi,
    'EMPLOYEE_ID'
  );

  replace(
    /\b(?:document\s+(?:id|number|no\.?|reference|classification|filename)|nomor\s+dokumen|no\.?\s*dokumen|referensi\s+dokumen|klasifikasi\s+dokumen|nama\s+file|filename|document\s+metadata)\s*[:=#-]\s*("[^"]+"|'[^']+'|[^,;\n}\]]{3,120})/gi,
    'CONFIDENTIAL_DOCUMENT_METADATA'
  );

  return {
    text,
    redactions: Object.values(categories).reduce((total, count) => total + Number(count || 0), 0),
    categories
  };
}
