'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Scale,
  Sparkles
} from 'lucide-react';

type MaterialityForm = {
  scopeName: string;
  fiscalYear: string;
  reportingPeriod: string;
  consolidationBasis: string;
  accountingFramework: string;
  benchmarkType: string;
  benchmarkAmount: string;
  overallMaterialityPercent: string;
  overallMaterialityAmount: string;
  performanceMaterialityPercent: string;
  performanceMaterialityAmount: string;
  clearlyTrivialPercent: string;
  clearlyTrivialAmount: string;
  currency: string;
  notes: string;
};

type Suggestion = {
  benchmarkType: string;
  benchmarkAmount: number;
  benchmarkSource: string;
  omPercent: number;
  omAmount: number;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Needs Review';
  pmPercent: number | null;
  pmAmount: number | null;
  trivialPercent: number;
  trivialAmount: number | null;
  benchmarkRationale: string;
  pmRationale: string;
  analysisSummary: string;
  warnings: string[];
  alternatives: Array<{
    benchmarkType: string;
    benchmarkAmount: number;
    omPercent: number;
    omAmount: number;
    rationale: string;
  }>;
};

const BENCHMARK_GUIDE = [
  ['Profit Before Tax', 'Laba sebelum pajak (PBT)', '5%', 'Laba stabil & menjadi fokus pengguna'],
  ['Total Assets', 'Total aset', '0,5%–1%', 'Laba volatil; fokus pada neraca'],
  ['Revenue', 'Pendapatan', '0,5%–1%', 'Laba tipis atau negatif'],
  ['Equity', 'Ekuitas', '1%–2%', 'Fokus permodalan / solvabilitas'],
  ['Average PBT 3 Years', 'Rata-rata PBT 3 tahun', '5%', 'Laba berfluktuasi']
];

function formatAmount(value: number | null, currency: string) {
  if (value === null || !Number.isFinite(value)) return 'Perlu review';
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: currency || 'IDR',
      maximumFractionDigits: 0
    }).format(value);
  } catch {
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value);
  }
}

function riskLabel(value: string) {
  if (value === 'Low') return 'Rendah';
  if (value === 'Medium') return 'Sedang';
  if (value === 'High') return 'Tinggi';
  return 'Perlu Review';
}

export function MaterialityAiAssistant({
  form,
  onApply
}: {
  form: MaterialityForm;
  onApply: (next: Partial<MaterialityForm>) => void;
}) {
  const [riskLevelPreference, setRiskLevelPreference] = useState('');
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const canGenerate = Number(form.benchmarkAmount || 0) > 0 || Boolean(form.benchmarkType);

  const pmGuide = useMemo(
    () => [
      ['Rendah', '± 75% OM', 'Kontrol matang, sedikit temuan, sistem stabil'],
      ['Sedang', '± 60%–65% OM', 'Beberapa temuan/perubahan sistem terbatas'],
      ['Tinggi', '± 50% OM', 'Banyak temuan/perubahan besar/implementasi awal']
    ],
    []
  );

  const generate = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/icofr/scoping/materiality-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          riskLevelPreference: riskLevelPreference || null
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Gagal membuat usulan OM/PM.');
      setSuggestion(payload.suggestion);
      setMessage('Usulan AI siap direview. Belum ada nilai yang diterapkan ke form.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat usulan OM/PM.');
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!suggestion) return;
    const auditNote =
      '[USULAN AI MATERIALITAS]\n' +
      'Benchmark: ' + suggestion.benchmarkType + '\n' +
      'Sumber: ' + suggestion.benchmarkSource + '\n' +
      'Alasan benchmark: ' + suggestion.benchmarkRationale + '\n' +
      'Tingkat risiko PM: ' + riskLabel(suggestion.riskLevel) + '\n' +
      'Alasan PM: ' + suggestion.pmRationale + '\n' +
      'Catatan: keputusan final tetap memerlukan review dan persetujuan.';

    onApply({
      benchmarkType: suggestion.benchmarkType,
      benchmarkAmount: String(suggestion.benchmarkAmount),
      overallMaterialityPercent: String(suggestion.omPercent),
      overallMaterialityAmount: String(suggestion.omAmount),
      performanceMaterialityPercent:
        suggestion.pmPercent === null ? form.performanceMaterialityPercent : String(suggestion.pmPercent),
      performanceMaterialityAmount:
        suggestion.pmAmount === null ? form.performanceMaterialityAmount : String(suggestion.pmAmount),
      clearlyTrivialPercent: String(suggestion.trivialPercent),
      clearlyTrivialAmount:
        suggestion.trivialAmount === null ? form.clearlyTrivialAmount : String(suggestion.trivialAmount),
      notes: [form.notes, auditNote].filter(Boolean).join('\n\n')
    });
    setMessage('Usulan diterapkan ke form sebagai draf. Simpan scope untuk menyimpan keputusan final.');
  };

  return (
    <div className="mb-4 space-y-3 rounded-2xl border border-sky-200 bg-sky-50/50 p-3.5">
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sky-700 shadow-sm ring-1 ring-sky-100">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-black text-slate-900">AI Penetapan OM / PM</div>
          <p className="mt-1 text-[9px] leading-4 text-slate-500">
            ARC AI memberi usulan benchmark, persentase OM, PM, dan Clearly Trivial/SAD.
            Usulan tidak otomatis menjadi keputusan final dan tetap wajib direview.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-[560px] w-full text-left text-[8px]">
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="px-2.5 py-2">Benchmark</th>
              <th className="px-2.5 py-2">Rentang metodologi</th>
              <th className="px-2.5 py-2">Kapan relevan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {BENCHMARK_GUIDE.map(([key, label, range, when]) => (
              <tr key={key}>
                <td className="px-2.5 py-2 font-bold text-slate-700">{label}</td>
                <td className="px-2.5 py-2 text-slate-600">{range}</td>
                <td className="px-2.5 py-2 text-slate-500">{when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {pmGuide.map(([risk, pct, note]) => (
          <div key={risk} className="rounded-xl border border-slate-200 bg-white p-2.5">
            <div className="text-[9px] font-black text-slate-800">Risiko {risk}</div>
            <div className="mt-1 text-sm font-black text-brand-700">PM {pct}</div>
            <div className="mt-1 text-[8px] leading-3.5 text-slate-400">{note}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="text-[9px] font-black text-slate-700">
          Tingkat risiko untuk PM
          <select
            value={riskLevelPreference}
            onChange={event => setRiskLevelPreference(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px] font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          >
            <option value="">AI rekomendasikan bila bukti memadai</option>
            <option value="Low">Rendah</option>
            <option value="Medium">Sedang</option>
            <option value="High">Tinggi</option>
          </select>
        </label>

        <button
          type="button"
          disabled={!canGenerate || loading}
          onClick={() => void generate()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-sky-500 px-4 text-[10px] font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? 'Menganalisis…' : 'Buat Usulan OM/PM dengan AI'}
        </button>
      </div>

      {!canGenerate && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[8px] leading-3.5 text-amber-800">
          Isi minimal jenis dan/atau nilai benchmark. Jika data akun keuangan sudah tersedia di Total ARC,
          AI juga akan memeriksa kandidat benchmark yang dapat diverifikasi.
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[9px] text-rose-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {message && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[9px] text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {message}
        </div>
      )}

      {suggestion && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-brand-600" />
            <div className="text-[10px] font-black text-slate-900">Usulan AI — perlu review pengguna</div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-[7px] font-black uppercase text-slate-400">Benchmark</div>
              <div className="mt-1 text-[9px] font-black text-slate-800">{suggestion.benchmarkType}</div>
              <div className="mt-0.5 text-[8px] text-slate-500">
                {formatAmount(suggestion.benchmarkAmount, form.currency)}
              </div>
            </div>
            <div className="rounded-lg bg-sky-50 p-2">
              <div className="text-[7px] font-black uppercase text-sky-600">Overall Materiality</div>
              <div className="mt-1 text-[9px] font-black text-slate-800">{suggestion.omPercent}%</div>
              <div className="mt-0.5 text-[8px] text-slate-500">
                {formatAmount(suggestion.omAmount, form.currency)}
              </div>
            </div>
            <div className="rounded-lg bg-indigo-50 p-2">
              <div className="text-[7px] font-black uppercase text-indigo-600">Performance Materiality</div>
              <div className="mt-1 text-[9px] font-black text-slate-800">
                {suggestion.pmPercent === null ? 'Perlu review' : suggestion.pmPercent + '% OM'}
              </div>
              <div className="mt-0.5 text-[8px] text-slate-500">
                {formatAmount(suggestion.pmAmount, form.currency)}
              </div>
            </div>
            <div className="rounded-lg bg-amber-50 p-2">
              <div className="text-[7px] font-black uppercase text-amber-700">Clearly Trivial / SAD</div>
              <div className="mt-1 text-[9px] font-black text-slate-800">{suggestion.trivialPercent}% PM</div>
              <div className="mt-0.5 text-[8px] text-slate-500">
                {formatAmount(suggestion.trivialAmount, form.currency)}
              </div>
            </div>
          </div>

          <div className="space-y-1.5 text-[8px] leading-3.5 text-slate-600">
            <p><strong>Sumber benchmark:</strong> {suggestion.benchmarkSource}</p>
            <p><strong>Alasan benchmark:</strong> {suggestion.benchmarkRationale}</p>
            <p><strong>Tingkat risiko PM:</strong> {riskLabel(suggestion.riskLevel)}</p>
            <p><strong>Alasan PM:</strong> {suggestion.pmRationale}</p>
            <p><strong>Ringkasan:</strong> {suggestion.analysisSummary}</p>
          </div>

          {suggestion.warnings?.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[8px] leading-3.5 text-amber-800">
              <strong>Hal yang perlu direview:</strong> {suggestion.warnings.join(' · ')}
            </div>
          )}

          {suggestion.alternatives?.length > 0 && (
            <div>
              <div className="mb-1.5 text-[8px] font-black uppercase tracking-wide text-slate-400">
                Alternatif pembanding
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {suggestion.alternatives.map(item => (
                  <div key={item.benchmarkType} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <div className="text-[9px] font-black text-slate-800">{item.benchmarkType}</div>
                    <div className="mt-1 text-[8px] text-slate-500">
                      {item.omPercent}% → {formatAmount(item.omAmount, form.currency)}
                    </div>
                    <div className="mt-1 text-[8px] leading-3.5 text-slate-400">{item.rationale}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={suggestion.pmPercent === null}
            onClick={apply}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            <CheckCircle2 className="h-4 w-4" />
            Terapkan Usulan ke Form
          </button>

          <p className="text-[8px] leading-3.5 text-slate-400">
            Rentang di atas merupakan referensi metodologi/praktik audit ilustratif, bukan persentase
            universal atau ketentuan regulator. Keputusan final wajib didokumentasikan dan disetujui
            sesuai tata kelola ICOFR institusi.
          </p>
        </div>
      )}
    </div>
  );
}
