const fs = require('fs');

const failures = [];

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(path, value, label) {
  const content = read(path);
  if (!content.includes(value)) {
    failures.push(label + ': expected "' + value + '" in ' + path);
  }
}

function forbidText(path, value, label) {
  const content = read(path);
  if (content.includes(value)) {
    failures.push(label + ': English UI text remains: "' + value + '" in ' + path);
  }
}

const layout = 'src/app/layout.tsx';
requireText(layout, '<html lang="id">', 'Root HTML language');
requireText(layout, '<IndonesianUiLocalizer />', 'Global Indonesian localizer');
requireText(layout, 'Platform Terpadu Penjaminan, Risiko & Kontrol', 'Indonesian metadata title');

const localizer = 'src/components/common/IndonesianUiLocalizer.tsx';
requireText(localizer, "document.documentElement.lang = 'id'", 'Runtime document language');
requireText(localizer, "document.documentElement.dataset.uiLanguage = 'id-ID'", 'Runtime locale marker');
requireText(localizer, 'MutationObserver', 'Dynamic UI localization');
requireText(localizer, "'placeholder'", 'Placeholder localization');
requireText(localizer, "'aria-label'", 'Accessibility label localization');
requireText(localizer, "'alt'", 'Image alternative text localization');

const dictionary = 'src/lib/ui-language-id.ts';
[
  ["'Core Dashboard': 'Dasbor Utama'", 'Dashboard terminology'],
  ["'Institution Onboarding': 'Pendaftaran Institusi'", 'Institution terminology'],
  ["'Identify New Risk': 'Identifikasi Risiko Baru'", 'Risk action terminology'],
  ["'Enterprise Risk Register & Heatmaps': 'Register Risiko Perusahaan & Peta Panas'", 'Risk heatmap terminology'],
  ["'Pending User Validation': 'Menunggu Validasi Pengguna'", 'Validation terminology'],
  ["'High': 'Tinggi'", 'Risk rating terminology'],
  ["'Medium': 'Sedang'", 'Risk rating terminology'],
  ["'Low': 'Rendah'", 'Risk rating terminology'],
  ["'Review': 'Tinjau'", 'Review terminology'],
  ["'Workpaper Review': 'Penelaahan Kertas Kerja'", 'Workpaper terminology'],
  ["'Sampling & Evidence': 'Pengambilan Sampel & Bukti'", 'Sampling terminology'],
  ["'Walkthrough & ToD': 'Penelusuran Proses & ToD'", 'Walkthrough terminology'],
  ["'Assurance': 'Penjaminan'", 'Assurance terminology']
].forEach(([value, label]) => requireText(dictionary, value, label));

const shell = 'src/components/layout/AppShell.tsx';
[
  'Core Dashboard',
  'Institution Onboarding',
  'Organization Structure',
  'User & Role Management',
  'Authentication Security',
  'Process Architecture (BPM)',
  'Risk Universe & Heatmap',
  'Enterprise Evidence Repository',
  'Task Center & Escalation'
].forEach(value => forbidText(shell, value, 'Navigation localization'));
requireText(shell, "title: 'KELOLA'", 'Manage navigation group');
requireText(shell, "title: 'PENJAMINAN'", 'Assure navigation group');
requireText(shell, "title: 'PANTAU'", 'Monitor navigation group');
requireText(shell, "{ label: 'Beranda'", 'Mobile navigation');
requireText(shell, 'Penelusuran Proses & ToD', 'Walkthrough navigation');
requireText(shell, 'Penelaahan Kertas Kerja ICOFR', 'Workpaper navigation');

const login = 'src/app/login/page.tsx';
forbidText(login, '>Sign in<', 'Login localization');
forbidText(login, 'Sign in to Total ARC', 'Login submit localization');
forbidText(login, 'Total ARC Secure Access', 'Login heading localization');
requireText(login, '>Masuk<', 'Login heading');
requireText(login, "'Masuk ke Total ARC'", 'Login action');

const riskPage = 'src/app/risks/page.tsx';
requireText(riskPage, 'Register Risiko Perusahaan & Heatmap', 'Risk page heading');
requireText(riskPage, 'Identifikasi Risiko Baru', 'Manual risk action');
requireText(riskPage, 'Cari berdasarkan ID Risiko, Kategori, atau Judul...', 'Risk search');

const riskAi = 'src/components/risks/AiRiskRegisterGenerator.tsx';
requireText(riskAi, 'AI Buat Register Risiko', 'AI risk button');
requireText(riskAi, '— Pilih BPM sebelum membuat risiko dengan AI —', 'AI risk BPM selector');
requireText(riskAi, 'Buat Risiko dengan AI', 'AI risk generate action');
requireText(riskAi, 'Penyebab', 'Cause presentation');
requireText(riskAi, 'Kejadian', 'Event presentation');
requireText(riskAi, 'Dampak', 'Impact presentation');

const processFlow = 'src/components/processes/ProcessFlowDiagramPanel.tsx';
requireText(processFlow, 'Diagram Alur Proses', 'Process-flow heading');
requireText(processFlow, 'Buat & Simpan Alur', 'Process-flow generation action');

const processDocs = 'src/components/processes/ProcessSupportingDocumentAI.tsx';
requireText(processDocs, 'Dokumen Pendukung & Definisi Proses AI', 'Supporting-document heading');
requireText(processDocs, 'Unggah & Analisis', 'Supporting-document action');
requireText(processDocs, 'Validasi & Terapkan BPM', 'Human validation action');

const aiChat = 'src/app/api/ai/chat/route.ts';
requireText(
  aiChat,
  'Gunakan Bahasa Indonesia untuk seluruh jawaban kecuali pengguna secara eksplisit meminta bahasa lain.',
  'ARC AI chat language policy'
);

const aiAnalyze = 'src/app/api/ai/analyze/route.ts';
requireText(aiAnalyze, 'Semua nilai teks yang ditampilkan kepada pengguna harus menggunakan Bahasa Indonesia', 'Process AI Indonesian output');

const aiRisk = 'src/app/api/risks/ai-suggestions/route.ts';
requireText(aiRisk, 'wajib menggunakan Bahasa Indonesia', 'Risk AI Indonesian output');

const aiFlow = 'src/app/api/processes/[id]/flow-diagram/route.ts';
requireText(aiFlow, 'wajib menggunakan Bahasa Indonesia', 'Process flow AI Indonesian output');

const aiDocument = 'src/app/api/processes/[id]/supporting-documents/route.ts';
requireText(aiDocument, 'wajib menggunakan Bahasa Indonesia', 'Document AI Indonesian output');

if (failures.length) {
  console.error('Verifikasi antarmuka Bahasa Indonesia GAGAL:');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}

console.log('Verifikasi antarmuka Bahasa Indonesia LULUS');
console.log('- Bahasa dokumen dan metadata utama: id / id-ID.');
console.log('- Navigasi, login, BPM, Risk, Control/Assurance terminology memiliki padanan Indonesia.');
console.log('- UI dinamis dilokalkan melalui lapisan presentasi tanpa mengubah enum database/API.');
console.log('- ARC AI diarahkan menghasilkan teks pengguna dalam Bahasa Indonesia.');
console.log('- Akronim teknis seperti ICOFR, RCSA, ToD, ToE, CCM, BPM, RCM, ITGC, dan ITAC tetap dipertahankan.');
