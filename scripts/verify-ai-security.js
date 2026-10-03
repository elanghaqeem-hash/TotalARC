const fs = require('fs');

function read(path) {
  if (!fs.existsSync(path)) throw new Error('AI_SECURITY_INTEGRITY_ERROR: missing ' + path);
  return fs.readFileSync(path, 'utf8');
}

function requireMarker(path, marker) {
  if (!read(path).includes(marker)) {
    throw new Error('AI_SECURITY_INTEGRITY_ERROR: ' + path + ' missing marker: ' + marker);
  }
}

const redaction = 'src/lib/ai/redaction.ts';
for (const category of [
  'CIF',
  'BANK_ACCOUNT',
  'CARD_NUMBER',
  'NIK',
  'NPWP',
  'LOAN_ACCOUNT',
  'EMPLOYEE_ID',
  'CONFIDENTIAL_DOCUMENT_METADATA'
]) {
  requireMarker(redaction, "'" + category + "'");
}

requireMarker(redaction, 'luhnValid');
requireMarker(redaction, 'plausibleNik');
requireMarker('src/lib/ai/gateway.ts', "import { redactBankingSensitiveData } from './redaction';");
requireMarker('src/lib/ai/gateway.ts', 'redactBankingSensitiveData(value)');
requireMarker('src/lib/ai/http-security.ts', 'guardAiPost');
requireMarker('wrangler.jsonc', '"AI_DEFAULT_SENSITIVITY": "confidential"');
requireMarker('wrangler.jsonc', '"AI_ALLOW_EXTERNAL_FOR_SENSITIVE": "false"');
requireMarker('wrangler.jsonc', '"AI_REDACT_EXTERNAL": "true"');

console.log('AI security integrity verified: banking-sensitive classifier, private-by-default routing and endpoint guards are present.');
