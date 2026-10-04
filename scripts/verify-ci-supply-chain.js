const fs = require('fs');
const path = require('path');

const root = path.join(process.cwd(), '.github', 'workflows');
const shaPattern = /^[0-9a-f]{40}$/i;
const workflowPattern = /\.ya?ml$/i;

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const violations = [];
const externalUses = [];

for (const file of walk(root).filter(file => workflowPattern.test(file))) {
  const relative = path.relative(process.cwd(), file).replace(/\\/g, '/');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

  lines.forEach((line, index) => {
    const match = line.match(/\buses:\s*([^\s#]+)/);
    if (!match) return;

    const target = match[1].trim();
    if (target.startsWith('./') || target.startsWith('docker://')) return;

    const at = target.lastIndexOf('@');
    if (at <= 0) {
      violations.push(`${relative}:${index + 1} missing immutable action ref: ${target}`);
      return;
    }

    const action = target.slice(0, at);
    const ref = target.slice(at + 1);
    externalUses.push({ file: relative, line: index + 1, action, ref });

    if (!shaPattern.test(ref)) {
      violations.push(
        `${relative}:${index + 1} ${action}@${ref} is mutable; pin to a full 40-character commit SHA.`
      );
    }
  });
}

if (violations.length) {
  console.error('CI_SUPPLY_CHAIN_INTEGRITY_ERROR');
  for (const violation of violations) console.error('- ' + violation);
  process.exit(1);
}

const uniqueActions = [...new Set(externalUses.map(item => item.action))].sort();
console.log(
  `CI supply-chain integrity verified: ${externalUses.length} external action references across workflows are pinned to immutable 40-character commit SHAs.`
);
console.log('Pinned actions: ' + uniqueActions.join(', '));
