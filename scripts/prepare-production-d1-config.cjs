const fs = require('node:fs');
const path = require('node:path');

function stripJsonComments(input) {
  let output = '';
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (lineComment) {
      if (char === '\n') {
        lineComment = false;
        output += char;
      }
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }

    output += char;
  }

  return output;
}

const databaseId = String(process.env.TOTALARC_D1_DATABASE_ID || '').trim();
const databaseName = String(process.env.TOTALARC_D1_DATABASE_NAME || '').trim();
const sourcePath = path.resolve(process.env.TOTALARC_WRANGLER_BASE || 'wrangler.jsonc');
const outputPath = path.resolve(process.env.TOTALARC_WRANGLER_OUTPUT || 'wrangler.production.json');

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(databaseId)) {
  throw new Error('TOTALARC_D1_DATABASE_ID must be a valid D1 UUID.');
}

if (!databaseName || databaseName.length > 128) {
  throw new Error('TOTALARC_D1_DATABASE_NAME is required and must be a valid database name.');
}

const config = JSON.parse(stripJsonComments(fs.readFileSync(sourcePath, 'utf8')));
const bindings = Array.isArray(config.d1_databases) ? config.d1_databases : [];
const dbBinding = bindings.find(binding => binding && binding.binding === 'DB');

if (!dbBinding) {
  throw new Error('wrangler.jsonc must declare the DB D1 binding.');
}

config.d1_databases = bindings.map(binding =>
  binding && binding.binding === 'DB'
    ? {
        ...binding,
        database_name: databaseName,
        database_id: databaseId
      }
    : binding
);

fs.writeFileSync(outputPath, JSON.stringify(config, null, 2) + '\n', 'utf8');

const maskedId = databaseId.slice(0, 8) + '…' + databaseId.slice(-4);
console.log(
  'Prepared deterministic TotalARC production D1 config: DB -> ' +
    databaseName +
    ' (' +
    maskedId +
    ')'
);
