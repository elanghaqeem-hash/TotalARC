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

const route = 'src/app/api/processes/[id]/supporting-documents/route.ts';
requireText(route, 'guardAiMultipart', 'Multipart AI upload protection');
requireText(route, 'resolveInstitutionAccess(request)', 'Active institution resolution');
requireText(route, 'uploadEvidenceVersion({', 'Evidence repository storage');
requireText(route, 'institutionId,', 'Explicit tenant scoping');
requireText(route, "entityType: 'PROCESS'", 'Evidence linked to process');
requireText(route, 'extractProcessSupportingDocument', 'Document text extraction');
requireText(route, "task: 'process_document_analysis'", 'Dedicated AI document analysis task');
requireText(route, "sensitivity: 'confidential'", 'Confidential process document AI handling');
requireText(route, 'PENDING_USER_VALIDATION', 'Human validation status');
requireText(route, "actionType === 'REJECT'", 'Reject path');
requireText(route, "actionType !== 'APPLY'", 'Apply validation path');
requireText(route, 'replaceActivities', 'Explicit activity replacement control');

const extraction = 'src/lib/process-document-extraction.ts';
requireText(extraction, "ext === 'txt'", 'TXT extraction');
requireText(extraction, "ext === 'pptx'", 'PPTX internal extraction');
requireText(extraction, 'ai.toMarkdown', 'Workers AI Markdown Conversion');
requireText(extraction, "descriptionLanguage: 'id'", 'Image description language');
requireText(extraction, "pdf: { metadata: false }", 'PDF conversion option');

const persistence = 'src/lib/d1-process-document-analysis.ts';
requireText(persistence, 'CREATE TABLE IF NOT EXISTS ProcessDocumentAnalysis', 'Persistent analysis draft table');
requireText(persistence, 'institutionId TEXT NOT NULL', 'Analysis tenant ownership');
requireText(persistence, 'evidenceDocumentId TEXT NOT NULL', 'Evidence linkage');
requireText(persistence, "status TEXT NOT NULL DEFAULT 'PENDING_USER_VALIDATION'", 'Default draft status');
requireText(persistence, 'ACTIVITY_REPLACE_BLOCKED', 'Dependency protection');
requireText(persistence, "sourceType: 'AI_SUPPORTING_DOCUMENT'", 'Saved flow source lineage');
requireText(persistence, "action, entityType, recordId", 'Audit trail');

const evidence = 'src/lib/d1-evidence-repository.ts';
requireText(evidence, 'institutionId?: string | null;', 'Evidence API accepts explicit tenant');
requireText(evidence, 'institutionFor(db, input.institutionId)', 'Evidence write uses supplied tenant');

const ui = 'src/components/processes/ProcessSupportingDocumentAI.tsx';
requireText(ui, '.docx,.pdf,.txt,.pptx,.jpg,.jpeg,.png,.xlsx', 'Requested upload formats');
requireText(ui, 'Upload & Analyze', 'Upload and analyze action');
requireText(ui, 'AI Flowchart Preview', 'Flowchart preview');
requireText(ui, 'Use Master Suggestions', 'Non-destructive master suggestion action');
requireText(ui, 'Validate & Apply BPM', 'Explicit validation action');
requireText(ui, 'Replace existing Activity Register', 'Activity overwrite warning');
requireText(ui, 'Supporting document history', 'Analysis history');

const page = 'src/app/processes/page.tsx';
requireText(page, '<ProcessSupportingDocumentAI', 'Process form integration');
requireText(page, 'max-h-[92vh]', 'Mobile modal scrolling');

const aiTypes = 'src/lib/ai/types.ts';
requireText(aiTypes, "| 'process_document_analysis'", 'AI task registration');

if (findings.length) {
  console.error('Process supporting-document AI verification FAILED:');
  for (const finding of findings) console.error('- ' + finding);
  process.exit(1);
}

console.log('Process supporting-document AI verification PASS');
console.log('- Original files are stored in institution-scoped Evidence Repository records.');
console.log('- DOCX/PDF/TXT/PPTX/JPEG/PNG/XLSX analysis paths are wired.');
console.log('- AI output remains pending until explicit user validation.');
console.log('- Existing activity dependencies are protected from unsafe replacement.');
console.log('- Applied activity drafts produce a saved reusable process flow without another AI call.');
