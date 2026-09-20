import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';
import { isOrgUnitAuthorized, resolveAuthorizedOrgUnitIds } from '@/lib/auth';
import { getRegulatoryReport } from '@/lib/d1-reporting';
import { getRegulatoryReportTemplate } from '@/lib/regulatory-report-templates';

export const dynamic = 'force-dynamic';

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function multiline(value: unknown) {
  const escaped = escapeHtml(value);
  return escaped ? escaped.replace(/\n/g, '<br/>') : '<span class="empty">Belum diisi</span>';
}

function fileSafe(value: unknown) {
  return String(value || 'report')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'report';
}

function field(label: string, value: unknown) {
  if (!value) return '';
  return `
    <div class="analysis-field">
      <div class="analysis-label">${escapeHtml(label)}</div>
      <div class="analysis-value">${multiline(value)}</div>
    </div>
  `;
}

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const reportId = (url.searchParams.get('id') || '').trim();
  const format = (url.searchParams.get('format') || 'html').toLowerCase();

  if (!reportId) {
    return new Response('report id is required', { status: 400 });
  }

  const [report, authorizedOrgUnitIds] = await Promise.all([
    getRegulatoryReport(reportId, auth.user.institutionId),
    resolveAuthorizedOrgUnitIds(auth.user)
  ]);

  if (!report) {
    return new Response('Report not found', { status: 404 });
  }

  if (
    !isOrgUnitAuthorized(
      authorizedOrgUnitIds,
      typeof report.orgUnitId === 'string' ? report.orgUnitId : null
    )
  ) {
    return new Response('Report organization scope is not authorized', { status: 403 });
  }

  const template = getRegulatoryReportTemplate(String(report.templateCode || ''));
  if (!template) {
    return new Response('Report template not found', { status: 404 });
  }

  const sections = Array.isArray(report.sections)
    ? report.sections as Array<Record<string, unknown>>
    : [];

  const references = template.regulationReferences
    .map(reference => `<li>${escapeHtml(reference)}</li>`)
    .join('');

  const sourceLinks = template.sourceUrls
    .map(source => `<li>${escapeHtml(source)}</li>`)
    .join('');

  const sectionHtml = sections
    .map((section, index) => `
      <section class="section">
        <div class="section-number">${index + 1}</div>
        <div class="section-body">
          <h2>${escapeHtml(section.title)}</h2>
          <div class="reg-ref">${escapeHtml(section.regulatoryReference)}</div>
          <p class="guidance">${escapeHtml(section.guidance)}</p>

          ${field('Narasi / Content', section.content)}
          ${field('Analisis', section.analysisSummary)}
          ${field('Temuan Utama', section.keyFindings)}
          ${field('Root Cause', section.rootCause)}
          ${field('Analisis Dampak', section.impactAnalysis)}
          ${field('Rekomendasi', section.recommendation)}
          ${field('Tanggapan Manajemen', section.managementResponse)}
          ${field('Action Plan', section.actionPlan)}
          ${field('PIC / Owner', section.ownerName)}
          ${field('Target Date', section.targetDate)}
          ${field('Rating', section.rating)}
          ${field('Referensi Evidence', section.evidenceReference)}

          <div class="review-status">
            Status review: <strong>${escapeHtml(section.reviewStatus || 'Draft')}</strong>
          </div>
        </div>
      </section>
    `)
    .join('');

  const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(report.title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    color: #0f172a;
    background: #fff;
    font-size: 10.5pt;
    line-height: 1.55;
  }
  .page { max-width: 180mm; margin: 0 auto; }
  .cover {
    min-height: 245mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    page-break-after: always;
  }
  .eyebrow {
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: #0369a1;
    margin-bottom: 10px;
  }
  h1 { font-size: 24pt; line-height: 1.15; margin: 0 0 18px; }
  h2 { font-size: 14pt; line-height: 1.25; margin: 0 0 5px; }
  .meta {
    border-top: 2px solid #0f172a;
    border-bottom: 1px solid #cbd5e1;
    margin-top: 26px;
    padding: 14px 0;
  }
  .meta-row {
    display: grid;
    grid-template-columns: 42mm 1fr;
    gap: 6px;
    padding: 3px 0;
  }
  .meta-label { color: #64748b; }
  .notice {
    margin-top: 24px;
    padding: 12px 14px;
    border: 1px solid #f59e0b;
    background: #fffbeb;
    color: #92400e;
    font-size: 9pt;
  }
  .summary {
    page-break-after: always;
  }
  .summary-box {
    border: 1px solid #cbd5e1;
    padding: 13px 14px;
    margin: 10px 0 18px;
  }
  .section {
    display: grid;
    grid-template-columns: 10mm 1fr;
    gap: 4mm;
    border-top: 1px solid #cbd5e1;
    padding: 12px 0 16px;
    page-break-inside: avoid;
  }
  .section-number {
    width: 8mm;
    height: 8mm;
    border-radius: 50%;
    background: #e0f2fe;
    color: #075985;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9pt;
  }
  .reg-ref { color: #0369a1; font-size: 8.5pt; font-weight: 700; }
  .guidance { color: #64748b; font-size: 8.5pt; margin: 5px 0 12px; }
  .analysis-field { margin: 8px 0; }
  .analysis-label {
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: #64748b;
    font-weight: 700;
    margin-bottom: 2px;
  }
  .analysis-value { white-space: normal; }
  .empty { color: #94a3b8; font-style: italic; }
  .review-status {
    margin-top: 10px;
    padding-top: 7px;
    border-top: 1px dashed #cbd5e1;
    font-size: 8.5pt;
    color: #475569;
  }
  .references {
    page-break-before: always;
  }
  ul { margin-top: 6px; padding-left: 20px; }
  .footer-note {
    margin-top: 18px;
    font-size: 8pt;
    color: #64748b;
  }
  @media print {
    .no-print { display: none; }
  }
</style>
</head>
<body>
<div class="page">
  <section class="cover">
    <div class="eyebrow">Total ARC · Regulatory Report Workspace · OJK</div>
    <h1>${escapeHtml(report.title)}</h1>
    <div>${escapeHtml(template.name)}</div>

    <div class="meta">
      <div class="meta-row"><div class="meta-label">Periode</div><div>${escapeHtml(report.period)}</div></div>
      <div class="meta-row"><div class="meta-label">Tanggal pelaporan</div><div>${escapeHtml(report.reportingDate)}</div></div>
      <div class="meta-row"><div class="meta-label">Report owner</div><div>${escapeHtml(report.reportOwner)}</div></div>
      <div class="meta-row"><div class="meta-label">Reviewer</div><div>${escapeHtml(report.reviewerName || 'Belum ditetapkan')}</div></div>
      <div class="meta-row"><div class="meta-label">Status</div><div>${escapeHtml(report.status)}</div></div>
      <div class="meta-row"><div class="meta-label">Overall rating</div><div>${escapeHtml(report.overallRating || 'Belum ditetapkan')}</div></div>
      <div class="meta-row"><div class="meta-label">Template code</div><div>${escapeHtml(report.templateCode)}</div></div>
      <div class="meta-row"><div class="meta-label">Verified reference date</div><div>${escapeHtml(template.verifiedAsOf)}</div></div>
    </div>

    <div class="notice">
      ${escapeHtml(template.submissionNote)}
      ${template.officialAnnexRequired
        ? '<br/><strong>Official OJK annex/Excel is required for the numeric publication format.</strong>'
        : ''}
    </div>
  </section>

  <section class="summary">
    <h2>Ringkasan Eksekutif</h2>
    <div class="summary-box">${multiline(report.executiveSummary)}</div>

    <h2>Kesimpulan</h2>
    <div class="summary-box">${multiline(report.conclusion)}</div>

    <h2>AI Advisory Analysis</h2>
    <div class="summary-box">
      ${multiline(
        report.aiAnalysis && typeof report.aiAnalysis === 'object'
          ? (report.aiAnalysis as Record<string, unknown>).overallAnalysis
          : ''
      )}
      <div class="footer-note">
        AI Draft — Human Review Required. AI tidak merupakan persetujuan, sertifikasi, atau penyampaian resmi kepada regulator.
      </div>
    </div>
  </section>

  ${sectionHtml}

  <section class="references">
    <h2>Dasar Regulasi</h2>
    <ul>${references}</ul>

    <h2>Sumber Resmi OJK</h2>
    <ul>${sourceLinks}</ul>

    <div class="footer-note">
      Dokumen ini dihasilkan dari workspace Total ARC dan wajib direview oleh fungsi yang berwenang.
      Untuk template yang memiliki lampiran resmi OJK, dokumen ini tidak menggantikan file/format resmi yang diwajibkan OJK.
    </div>
  </section>
</div>
</body>
</html>`;

  const filename = fileSafe(report.title) + '-' + fileSafe(report.period);

  if (format === 'doc') {
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'application/msword; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.doc"`,
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="${filename}.html"`,
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
