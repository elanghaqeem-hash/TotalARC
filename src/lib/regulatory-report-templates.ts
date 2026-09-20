export type RegulatoryReportSectionTemplate = {
  key: string;
  title: string;
  guidance: string;
  regulatoryReference: string;
};

export type RegulatoryReportTemplate = {
  code: string;
  name: string;
  institutionScope: string;
  regulator: 'OJK';
  regulationReferences: string[];
  effectiveFrom: string;
  verifiedAsOf: string;
  sourceUrls: string[];
  officialAnnexRequired: boolean;
  submissionNote: string;
  sections: RegulatoryReportSectionTemplate[];
};

const governanceFactors = [
  'Pelaksanaan tugas, tanggung jawab, dan wewenang Direksi',
  'Pelaksanaan tugas, tanggung jawab, dan wewenang Dewan Komisaris',
  'Kelengkapan dan pelaksanaan tugas komite',
  'Penanganan benturan kepentingan',
  'Penerapan fungsi kepatuhan',
  'Penerapan fungsi audit intern',
  'Penerapan fungsi audit ekstern',
  'Penerapan manajemen risiko termasuk sistem pengendalian intern',
  'Pemberian remunerasi',
  'Penyediaan dana kepada pihak terkait dan penyediaan dana besar',
  'Integritas pelaporan dan sistem teknologi informasi',
  'Rencana strategis Bank',
  'Aspek pemegang saham',
  'Penerapan strategi anti fraud termasuk anti penyuapan',
  'Penerapan keuangan berkelanjutan termasuk tanggung jawab sosial dan lingkungan',
  'Penerapan tata kelola dalam Kelompok Usaha Bank'
];

const governanceSections: RegulatoryReportSectionTemplate[] = [
  {
    key: 'executive-summary',
    title: 'Ringkasan Eksekutif',
    guidance: 'Ringkas kondisi penerapan tata kelola, isu utama, perubahan material, dan prioritas perbaikan berdasarkan bukti yang tersedia.',
    regulatoryReference: 'POJK 17 Tahun 2023; SEOJK 14/SEOJK.03/2025'
  },
  {
    key: 'scope-methodology',
    title: 'Ruang Lingkup, Periode, dan Metodologi',
    guidance: 'Jelaskan entitas/unit yang dicakup, periode penilaian, sumber data, proses review, keterbatasan data, dan mekanisme self-assessment.',
    regulatoryReference: 'SEOJK 14/SEOJK.03/2025'
  },
  ...governanceFactors.map((title, index) => ({
    key: 'factor-' + String(index + 1).padStart(2, '0'),
    title: 'Faktor ' + (index + 1) + ' — ' + title,
    guidance: 'Dokumentasikan struktur/proses yang berlaku, kecukupan pelaksanaan, bukti pendukung, kelemahan atau gap, dampak, dan tindak lanjut.',
    regulatoryReference: 'SEOJK 14/SEOJK.03/2025'
  })),
  {
    key: 'self-assessment',
    title: 'Kesimpulan Self-Assessment Tata Kelola',
    guidance: 'Sajikan hasil penilaian secara faktual, dasar penilaian, faktor dominan, area yang memerlukan perhatian, dan keterbatasan evidence.',
    regulatoryReference: 'SEOJK 14/SEOJK.03/2025'
  },
  {
    key: 'follow-up',
    title: 'Rencana Tindak Lanjut',
    guidance: 'Rangkum action plan, penanggung jawab, target waktu, status, dan ketergantungan terhadap remediation yang tersimpan pada Total ARC.',
    regulatoryReference: 'SEOJK 14/SEOJK.03/2025'
  },
  {
    key: 'conclusion',
    title: 'Kesimpulan dan Pernyataan Manajemen',
    guidance: 'Sajikan kesimpulan akhir dan ruang untuk pernyataan/review manajemen. Jangan menyatakan kepatuhan apabila evidence belum memadai.',
    regulatoryReference: 'POJK 17 Tahun 2023; SEOJK 14/SEOJK.03/2025'
  }
];

export const REGULATORY_REPORT_TEMPLATES: RegulatoryReportTemplate[] = [
  {
    code: 'OJK-GCG-BANK-UMUM-2025',
    name: 'Laporan Pelaksanaan Tata Kelola Bank Umum',
    institutionScope: 'Bank Umum Konvensional / Bank Umum Syariah',
    regulator: 'OJK',
    regulationReferences: [
      'POJK Nomor 17 Tahun 2023 tentang Penerapan Tata Kelola Bagi Bank Umum',
      'SEOJK Nomor 14/SEOJK.03/2025 tentang Penerapan Tata Kelola Bagi Bank Umum'
    ],
    effectiveFrom: '2025-06-24',
    verifiedAsOf: '2026-09-20',
    sourceUrls: [
      'https://ojk.go.id/id/regulasi/Pages/Penerapan-Tata-Kelola-Bagi-Bank-Umum.aspx',
      'https://ojk.go.id/id/regulasi/Pages/SEOJK-14-SEOJK032025-Penerapan-Tata-Kelola-Bagi-Bank-Umum.aspx'
    ],
    officialAnnexRequired: false,
    submissionNote:
      'Workspace ini menyusun narasi, self-assessment, temuan, evidence, dan tindak lanjut mengikuti 16 faktor tata kelola pada SEOJK 14/2025. User tetap harus melakukan review manusia sebelum penyampaian resmi.',
    sections: governanceSections
  },
  {
    code: 'OJK-RISK-BANK-UMUM-2016',
    name: 'Laporan Analisis Penerapan Manajemen Risiko Bank Umum',
    institutionScope: 'Bank Umum',
    regulator: 'OJK',
    regulationReferences: [
      'POJK Nomor 18/POJK.03/2016 tentang Penerapan Manajemen Risiko bagi Bank Umum',
      'SEOJK Nomor 34/SEOJK.03/2016 tentang Penerapan Manajemen Risiko bagi Bank Umum'
    ],
    effectiveFrom: '2016-09-01',
    verifiedAsOf: '2026-09-20',
    sourceUrls: [
      'https://ojk.go.id/id/regulasi/Pages/POJK-tentang-Penerapan-Manajemen-Resiko-bagi-Bank-Umum.aspx',
      'https://ojk.go.id/id/regulasi/Pages/Penerapan-Manajemen-Risiko-Bagi-Bank-Umum.aspx'
    ],
    officialAnnexRequired: false,
    submissionNote:
      'Template ini merupakan workspace analisis risiko berbasis ketentuan OJK. Struktur pelaporan final dan kanal penyampaian harus divalidasi terhadap ketentuan OJK yang berlaku pada periode pelaporan.',
    sections: [
      {
        key: 'executive-summary',
        title: 'Ringkasan Eksekutif Profil Risiko',
        guidance: 'Ringkas eksposur utama, risiko tinggi/kritis, tren, efektivitas kontrol, isu material, dan remediation.',
        regulatoryReference: 'POJK 18/POJK.03/2016; SEOJK 34/SEOJK.03/2016'
      },
      {
        key: 'risk-governance',
        title: 'Pengawasan Aktif Direksi dan Dewan Komisaris',
        guidance: 'Uraikan governance, kebijakan, eskalasi, risk appetite/limit, dan oversight yang dapat dibuktikan.',
        regulatoryReference: 'POJK 18/POJK.03/2016'
      },
      {
        key: 'framework',
        title: 'Kecukupan Kebijakan, Prosedur, dan Penetapan Limit',
        guidance: 'Analisis kecukupan kerangka kebijakan/prosedur, limit, ownership, dan gap terhadap proses yang terdaftar.',
        regulatoryReference: 'SEOJK 34/SEOJK.03/2016'
      },
      {
        key: 'risk-process',
        title: 'Identifikasi, Pengukuran, Pemantauan, dan Pengendalian Risiko',
        guidance: 'Analisis risiko terdaftar, metodologi pengukuran, monitoring, control coverage, dan residual exposure.',
        regulatoryReference: 'SEOJK 34/SEOJK.03/2016'
      },
      {
        key: 'mis',
        title: 'Sistem Informasi Manajemen Risiko',
        guidance: 'Nilai ketersediaan, integritas, ketepatan waktu, dan traceability informasi risiko berdasarkan evidence sistem.',
        regulatoryReference: 'SEOJK 34/SEOJK.03/2016'
      },
      {
        key: 'internal-control',
        title: 'Sistem Pengendalian Intern',
        guidance: 'Analisis desain dan efektivitas kontrol, ToD/ToE, RCSA/CSA, CCM, exception, dan certification.',
        regulatoryReference: 'POJK 18/POJK.03/2016'
      },
      {
        key: 'issues-remediation',
        title: 'Temuan, Root Cause, dan Remediation',
        guidance: 'Sajikan isu material, root cause, dampak, action plan, owner, target date, overdue status, dan retest.',
        regulatoryReference: 'SEOJK 34/SEOJK.03/2016'
      },
      {
        key: 'conclusion',
        title: 'Kesimpulan Penerapan Manajemen Risiko',
        guidance: 'Sajikan kesimpulan berbasis evidence dan area yang masih memerlukan data atau validasi.',
        regulatoryReference: 'POJK 18/POJK.03/2016; SEOJK 34/SEOJK.03/2016'
      }
    ]
  },
  {
    code: 'OJK-PUBLICATION-BUK-2025',
    name: 'Laporan Publikasi Bank Umum Konvensional',
    institutionScope: 'Bank Umum Konvensional',
    regulator: 'OJK',
    regulationReferences: [
      'POJK Nomor 18 Tahun 2025 tentang Transparansi dan Publikasi Laporan Bank',
      'SEOJK Nomor 29/SEOJK.03/2025 tentang Transparansi dan Publikasi Laporan Bank Umum Konvensional'
    ],
    effectiveFrom: '2026-02-09',
    verifiedAsOf: '2026-09-20',
    sourceUrls: [
      'https://ojk.go.id/id/regulasi/Pages/POJK-18-Tahun-2025-Transparansi-dan-Publikasi-Laporan-Bank.aspx',
      'https://ojk.go.id/id/regulasi/Pages/29-SEOJK03-2025-Transparansi-dan-Publikasi-Laporan-Bank-Umum-Konvensional.aspx'
    ],
    officialAnnexRequired: true,
    submissionNote:
      'SEOJK 29/2025 menyediakan format minimum dan file Excel resmi. Total ARC dapat menyusun narasi, analisis risiko/kontrol, evidence, dan review; angka laporan publikasi harus direkonsiliasi dengan sumber keuangan resmi dan format Excel OJK sebelum publikasi/penyampaian.',
    sections: [
      {
        key: 'declaration',
        title: 'Pernyataan dan Tata Kelola Penyusunan Laporan',
        guidance: 'Catat pejabat penyusun, proses review, sumber data, rekonsiliasi, dan status persetujuan.',
        regulatoryReference: 'POJK 18 Tahun 2025; SEOJK 29/SEOJK.03/2025'
      },
      {
        key: 'financial-performance',
        title: 'Laporan Keuangan dan Informasi Kinerja Keuangan',
        guidance: 'Hubungkan narasi dan kontrol pelaporan; data angka wajib berasal dari sumber keuangan resmi sesuai format OJK.',
        regulatoryReference: 'SEOJK 29/SEOJK.03/2025'
      },
      {
        key: 'risk-capital',
        title: 'Eksposur Risiko dan Permodalan',
        guidance: 'Ringkas analisis risiko/permodalan dan evidence pendukung; angka wajib mengikuti rekonsiliasi dan format resmi.',
        regulatoryReference: 'SEOJK 29/SEOJK.03/2025'
      },
      {
        key: 'material-facts',
        title: 'Informasi atau Fakta Material',
        guidance: 'Dokumentasikan fakta material yang telah diverifikasi, sumber, tanggal, owner, dan status disclosure.',
        regulatoryReference: 'POJK 18 Tahun 2025; SEOJK 29/SEOJK.03/2025'
      },
      {
        key: 'sbdk',
        title: 'Suku Bunga Dasar Kredit dan Laporan Publikasi Lain',
        guidance: 'Gunakan sumber resmi dan format lampiran OJK. Total ARC tidak boleh mengestimasi angka yang tidak tersedia.',
        regulatoryReference: 'SEOJK 29/SEOJK.03/2025'
      },
      {
        key: 'control-assurance',
        title: 'Analisis Integritas Pelaporan dan Assurance',
        guidance: 'Ringkas kontrol pelaporan, ICOFR, IPE, exception, certification, dan issue remediation yang relevan.',
        regulatoryReference: 'POJK 18 Tahun 2025'
      }
    ]
  },
  {
    code: 'OJK-PUBLICATION-BUS-UUS-2025',
    name: 'Laporan Publikasi BUS dan UUS',
    institutionScope: 'Bank Umum Syariah / Unit Usaha Syariah',
    regulator: 'OJK',
    regulationReferences: [
      'POJK Nomor 18 Tahun 2025 tentang Transparansi dan Publikasi Laporan Bank',
      'SEOJK Nomor 32/SEOJK.03/2025 tentang Transparansi dan Publikasi Laporan Bank Umum Syariah dan Unit Usaha Syariah'
    ],
    effectiveFrom: '2026-02-09',
    verifiedAsOf: '2026-09-20',
    sourceUrls: [
      'https://ojk.go.id/id/regulasi/Pages/POJK-18-Tahun-2025-Transparansi-dan-Publikasi-Laporan-Bank.aspx',
      'https://www.ojk.go.id/id/regulasi/Pages/32-SEOJK03-2025-Transparansi-dan-Publikasi-Laporan-BUS-dan-UUS.aspx'
    ],
    officialAnnexRequired: true,
    submissionNote:
      'SEOJK 32/2025 menyediakan format minimum dan file Excel resmi untuk BUS/UUS. Total ARC menyediakan workspace analisis dan assurance; data numerik final wajib memakai sumber resmi dan direkonsiliasi sebelum penyampaian/publikasi.',
    sections: [
      {
        key: 'declaration',
        title: 'Pernyataan dan Tata Kelola Penyusunan Laporan',
        guidance: 'Catat pejabat penyusun, proses review, sumber data, rekonsiliasi, dan status persetujuan.',
        regulatoryReference: 'POJK 18 Tahun 2025; SEOJK 32/SEOJK.03/2025'
      },
      {
        key: 'financial-performance',
        title: 'Laporan Keuangan dan Informasi Kinerja Keuangan BUS/UUS',
        guidance: 'Gunakan data keuangan resmi dan format lampiran OJK. Tambahkan penjelasan hanya bila didukung evidence.',
        regulatoryReference: 'SEOJK 32/SEOJK.03/2025'
      },
      {
        key: 'risk-capital',
        title: 'Eksposur Risiko dan Permodalan BUS',
        guidance: 'Ringkas analisis exposure dan assurance yang relevan tanpa mengestimasi angka yang tidak tersedia.',
        regulatoryReference: 'SEOJK 32/SEOJK.03/2025'
      },
      {
        key: 'material-facts',
        title: 'Informasi atau Fakta Material',
        guidance: 'Dokumentasikan fakta material terverifikasi, sumber, tanggal, owner, dan status disclosure.',
        regulatoryReference: 'POJK 18 Tahun 2025; SEOJK 32/SEOJK.03/2025'
      },
      {
        key: 'other-publication',
        title: 'Laporan Publikasi Lain',
        guidance: 'Gunakan format lampiran OJK dan catat data source, preparer, reviewer, dan rekonsiliasi.',
        regulatoryReference: 'SEOJK 32/SEOJK.03/2025'
      },
      {
        key: 'control-assurance',
        title: 'Analisis Integritas Pelaporan dan Assurance',
        guidance: 'Ringkas kontrol, ICOFR/IPE bila relevan, testing, exception, certification, dan remediation.',
        regulatoryReference: 'POJK 18 Tahun 2025'
      }
    ]
  }
];

export function getRegulatoryReportTemplate(code: string) {
  return REGULATORY_REPORT_TEMPLATES.find(template => template.code === code) || null;
}
