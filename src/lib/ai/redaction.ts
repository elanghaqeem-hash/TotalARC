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

function plausibleNik(candidate: string) {
  if (!/^\d{16}$/.test(candidate)) return false;
  const day = Number(candidate.slice(6, 8));
  const normalizedDay = day > 40 ? day - 40 : day;
  const month = Number(candidate.slice(8, 10));
  const year = Number(candidate.slice(10, 12));
  return normalizedDay >= 1 && normalizedDay <= 31 && month >= 1 && month <= 12 && year >= 0 && year <= 99;
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

  const replace = (
    pattern: RegExp,
    category: BankingRedactionCategory,
    replacement?: (match: string, ...groups: string[]) => string
  ) => {
    text = text.replace(pattern, (...args: unknown[]) => {
      addCount(categories, category);
      const match = String(args[0] || '');
      const groups = args.slice(1, -2).map(item => String(item ?? ''));
      return replacement ? replacement(match, ...groups) : '[' + category + '_REDACTED]';
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
    addCount(categories, 'CARD_NUMBER');
    return '[CARD_NUMBER_REDACTED]';
  });

  replace(
    /\b(?:nik|no\.?\s*nik|nomor\s+induk\s+kependudukan)\s*[:=#-]?\s*(\d{16})\b/gi,
    'NIK'
  );
  text = text.replace(/\b\d{16}\b/g, candidate => {
    if (!plausibleNik(candidate)) return candidate;
    addCount(categories, 'NIK');
    return '[NIK_REDACTED]';
  });

  replace(
    /\b(?:npwp|no\.?\s*npwp)\s*[:=#-]?\s*([0-9.\-]{15,24})\b/gi,
    'NPWP'
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
