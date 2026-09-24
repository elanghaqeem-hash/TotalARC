const fs = require('fs');

const findings = [];

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(path, value, label) {
  const content = read(path);
  if (!content.includes(value)) {
    findings.push(label + ': expected "' + value + '" in ' + path);
  }
}

const storage = 'src/lib/d1-process-flow.ts';
requireText(storage, 'CREATE TABLE IF NOT EXISTS ProcessFlowDiagram', 'Persistent flow table');
requireText(storage, 'institutionId TEXT NOT NULL', 'Tenant ownership');
requireText(storage, 'processId TEXT NOT NULL', 'Process ownership');
requireText(storage, 'diagramJson TEXT NOT NULL', 'Reusable structured flow');
requireText(storage, 'svgText TEXT NOT NULL', 'Reusable rendered flow');
requireText(storage, 'sourceHash TEXT NOT NULL', 'Source-change detection');
requireText(storage, 'WHERE id = ? AND institutionId = ? LIMIT 1', 'Tenant-scoped process lookup');
requireText(storage, 'WHERE institutionId = ? AND processId = ?', 'Tenant-scoped flow lookup');
requireText(storage, 'saveGeneratedProcessFlow', 'Saved AI generation');
requireText(storage, 'activateProcessFlowDiagram', 'Version activation');

const route = 'src/app/api/processes/[id]/flow-diagram/route.ts';
requireText(route, 'resolveInstitutionAccess(request)', 'Server-side institution resolution');
requireText(route, "task: 'process_flow'", 'Dedicated AI flow task');
requireText(route, "sensitivity: 'confidential'", 'Confidential BPM processing');
requireText(route, 'getProcessFlowWorkspace', 'Saved flow read path');
requireText(route, 'aiRequiredToView: false', 'No AI required for reuse');
requireText(route, 'PROCESS_SOURCE_CHANGED', 'Concurrent source-change protection');

const ui = 'src/components/processes/ProcessFlowDiagramPanel.tsx';
requireText(ui, 'Saved · reusable without AI', 'Reusable-state UI');
requireText(ui, 'Generate & Save', 'Initial generation action');
requireText(ui, 'Regenerate', 'Explicit AI regeneration action');
requireText(ui, 'downloadPng', 'PNG export');
requireText(ui, 'downloadSvg', 'SVG export');
requireText(ui, 'Set Active', 'Version reuse');
requireText(ui, 'workspace?.stale', 'Stale-source warning');

const page = 'src/app/processes/page.tsx';
requireText(page, '<ProcessFlowDiagramPanel process={selectedProcess} />', 'Process 360 integration');

const aiTypes = 'src/lib/ai/types.ts';
requireText(aiTypes, "| 'process_flow'", 'AI task registration');

if (findings.length) {
  console.error('Process flow persistence verification FAILED:');
  for (const finding of findings) console.error('- ' + finding);
  process.exit(1);
}

console.log('Process flow persistence verification PASS');
console.log('- AI generation is separated from saved diagram reuse.');
console.log('- Flow records are tenant- and process-scoped.');
console.log('- JSON + SVG are persisted with version and source hash.');
console.log('- PNG/SVG download and version activation are wired in the UI.');
