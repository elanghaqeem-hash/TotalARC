type TextLine = {
  text: string;
  bold?: boolean;
  size?: number;
  gapAfter?: number;
};

function ascii(value: unknown) {
  return String(value ?? '')
    .replace(/[–—]/g, '-')
    .replace(/×/g, 'x')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E\n]/g, '');
}

function escapePdf(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrap(value: unknown, maxChars = 92) {
  const paragraphs = ascii(value).split(/\n+/).map(item => item.trim()).filter(Boolean);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/);
    let line = '';
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (next.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [''];
}

function section(lines: TextLine[], title: string, body: unknown) {
  lines.push({ text: title, bold: true, size: 12, gapAfter: 3 });
  for (const line of wrap(body)) lines.push({ text: line, size: 9.5 });
  lines.push({ text: '', gapAfter: 4 });
}

function metric(value: unknown, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

export function buildEnterpriseAnalysisPdf(snapshot: {
  id: string;
  institutionName: string | null;
  generatedAt: string;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  readiness: Record<string, any>;
  metrics: Record<string, any>;
  analysis: Record<string, any>;
  disclaimer: string;
}) {
  const lines: TextLine[] = [];
  const a = snapshot.analysis || {};
  const m = snapshot.metrics || {};
  const readiness = snapshot.readiness || {};

  lines.push({ text: 'TOTAL ARC', bold: true, size: 16, gapAfter: 2 });
  lines.push({ text: 'Laporan Analisis Menyeluruh ICOFR, Risiko & Kepatuhan', bold: true, size: 14, gapAfter: 4 });
  lines.push({ text: 'Institusi: ' + ascii(snapshot.institutionName || '-'), size: 9.5 });
  lines.push({ text: 'Analysis ID: ' + ascii(snapshot.id), size: 8.5 });
  lines.push({ text: 'Dihasilkan: ' + new Date(snapshot.generatedAt).toLocaleString('id-ID'), size: 8.5 });
  lines.push({ text: 'Status reviu: ' + ascii(snapshot.status), size: 8.5 });
  if (snapshot.reviewedBy) lines.push({ text: 'Direviu oleh: ' + ascii(snapshot.reviewedBy), size: 8.5 });
  if (snapshot.reviewedAt) lines.push({ text: 'Waktu reviu: ' + new Date(snapshot.reviewedAt).toLocaleString('id-ID'), size: 8.5 });
  lines.push({ text: '', gapAfter: 5 });

  lines.push({ text: 'Overall ICOFR Readiness', bold: true, size: 11 });
  lines.push({ text: ascii(readiness.label || '-') + ' - ' + metric(readiness.score) + '%', bold: true, size: 13 });
  for (const line of wrap(readiness.description || '', 88)) lines.push({ text: line, size: 9.5 });
  lines.push({ text: '', gapAfter: 5 });

  section(lines, 'Ringkasan Eksekutif', a.executiveSummary || '');
  section(lines, 'ICOFR', a.icofrInsight || '');
  section(lines, 'Risiko', a.riskInsight || '');
  section(lines, 'Kepatuhan', a.complianceInsight || '');
  section(lines, 'Prioritas', a.priorityInsight || '');

  lines.push({ text: 'Metrik Utama', bold: true, size: 12, gapAfter: 2 });
  const metricsLines = [
    'Risk assessment coverage: ' + metric(m.risks?.assessmentCoveragePct) + '%',
    'Key controls: ' + metric(m.controls?.keyControls),
    'ICOFR key controls: ' + metric(m.controls?.icoFrKeyControls),
    'ToD completed: ' + metric(m.icofr?.todCompleted),
    'ToE completed: ' + metric(m.icofr?.toeCompleted),
    'Regulatory mapping coverage: ' + metric(m.compliance?.regulatoryMappingCoveragePct) + '%',
    'Open issues: ' + metric(m.remediation?.openIssues),
    'Open MAP: ' + metric(m.remediation?.openMaps)
  ];
  metricsLines.forEach(item => lines.push({ text: '- ' + item, size: 9.5 }));
  lines.push({ text: '', gapAfter: 4 });

  lines.push({ text: 'Rekomendasi', bold: true, size: 12, gapAfter: 2 });
  const recommendations = Array.isArray(a.recommendations) ? a.recommendations : [];
  recommendations.forEach((item: unknown, index: number) => {
    const wrapped = wrap(item, 86);
    wrapped.forEach((line, lineIndex) =>
      lines.push({
        text: (lineIndex === 0 ? String(index + 1) + '. ' : '   ') + line,
        size: 9.5
      })
    );
  });
  lines.push({ text: '', gapAfter: 4 });

  section(lines, 'Catatan Kehati-hatian', a.caution || snapshot.disclaimer || '');
  lines.push({ text: 'Dokumen ini diunduh setelah hasil analisis diaksep atau diperbarui oleh pengguna Total ARC.', size: 8.5 });

  const pages: TextLine[][] = [];
  let current: TextLine[] = [];
  let used = 0;
  for (const line of lines) {
    const size = line.size || 9.5;
    const height = line.text ? Math.max(11, size + 3) : 8;
    const next = used + height + (line.gapAfter || 0);
    if (next > 690 && current.length) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(line);
    used += height + (line.gapAfter || 0);
  }
  if (current.length) pages.push(current);

  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

  const pageRefs: string[] = [];
  pages.forEach((pageLines, pageIndex) => {
    const pageObject = 5 + pageIndex * 2;
    const contentObject = pageObject + 1;
    pageRefs.push(pageObject + ' 0 R');

    let y = 790;
    const stream: string[] = [];
    stream.push('0.75 w 0.82 0.86 0.90 RG 48 56 499 1 re S');
    for (const line of pageLines) {
      const size = line.size || 9.5;
      if (line.text) {
        stream.push(
          'BT /' + (line.bold ? 'F2' : 'F1') + ' ' + size + ' Tf 50 ' + y.toFixed(1) +
          ' Td (' + escapePdf(ascii(line.text)) + ') Tj ET'
        );
      }
      y -= line.text ? Math.max(11, size + 3) : 8;
      y -= line.gapAfter || 0;
    }
    stream.push(
      'BT /F1 8 Tf 50 35 Td (Total ARC - Halaman ' + (pageIndex + 1) + ' dari ' + pages.length + ') Tj ET'
    );

    const streamText = stream.join('\n');
    objects[contentObject] = '<< /Length ' + streamText.length + ' >>\nstream\n' + streamText + '\nendstream';
    objects[pageObject] =
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
      '/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> ' +
      '/Contents ' + contentObject + ' 0 R >>';
  });

  objects[2] = '<< /Type /Pages /Kids [' + pageRefs.join(' ') + '] /Count ' + pages.length + ' >>';

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 1; i < objects.length; i++) {
    if (!objects[i]) continue;
    offsets[i] = pdf.length;
    pdf += i + ' 0 obj\n' + objects[i] + '\nendobj\n';
  }

  const xrefOffset = pdf.length;
  pdf += 'xref\n0 ' + objects.length + '\n';
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < objects.length; i++) {
    const offset = offsets[i] || 0;
    pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\n';
  pdf += 'startxref\n' + xrefOffset + '\n%%EOF';

  return new TextEncoder().encode(pdf);
}
