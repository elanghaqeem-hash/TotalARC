'use client';

import { useEffect, useRef, useState } from 'react';
import { PdfCompressControl } from '@/components/documents/PdfCompressControl';
import { preparePdfText } from '@/lib/pdf-ocr-client';
import type { PolicyDocumentKind } from '@/lib/policy-document-ai';

const labels: Record<string, string> = {
  documentCode: 'Nomor ketentuan',
  documentType: 'Jenis ketentuan',
  title: 'Judul',
  ownerUnit: 'Unit pemilik',
  ownerName: 'Nama pemilik',
  version: 'Versi',
  issueDate: 'Tanggal terbit',
  effectiveDate: 'Tanggal berlaku',
  nextReviewDate: 'Jadwal review',
  scope: 'Cakupan',
  summary: 'Ringkasan',
  regulator: 'Regulator',
  regulationCode: 'Nomor regulasi',
  category: 'Kategori'
};

type Props = {
  kind: PolicyDocumentKind;
  onApply: (draft: Record<string, string>) => void;
  sourceDocumentId?: string | null;
  sourceTitle?: string | null;
  sourceTextLength?: number | null;
};

export function PolicyDocumentAI({
  kind,
  onApply,
  sourceDocumentId,
  sourceTitle,
  sourceTextLength
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [forceOcr, setForceOcr] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [provider, setProvider] = useState('');
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);

  useEffect(() => () => {
    generation.current += 1;
    request.current?.abort();
  }, []);

  const resetDraft = () => {
    setDraft(null);
    setError('');
    setWarning('');
    setProgress('');
    setProvider('');
  };

  const choose = (next: File | null) => {
    setFile(next);
    resetDraft();
  };

  async function requestDraft(
    body: Record<string, unknown>,
    current: number,
    successMessage: string
  ) {
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;

    const response = await fetch('/api/policy-library/document-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Analisis gagal.');
    if (current !== generation.current) return;

    setDraft(result.draft);
    setSelected(
      Object.fromEntries(
        Object.keys(result.draft || {}).map(key => [key, true])
      )
    );
    setProvider([result.provider, result.model].filter(Boolean).join(' · '));
    if (result.source?.truncated) {
      setWarning(
        'Artefak lebih panjang dari batas analisis AI. Ringkasan menggunakan excerpt terindeks; cocokkan dengan dokumen asli.'
      );
    }
    setProgress(successMessage);
  }

  async function analyzeStoredArtifact() {
    if (!sourceDocumentId || busy || compressing) return;
    const current = ++generation.current;
    setBusy(true);
    resetDraft();
    setProgress('Membaca artefak terindeks dari Source Library…');

    try {
      await requestDraft(
        { kind, sourceDocumentId },
        current,
        'Analisis artefak terdaftar selesai. Periksa draft sebelum digunakan.'
      );
    } catch (err) {
      if (current === generation.current) {
        setError(err instanceof Error ? err.message : 'Analisis gagal.');
      }
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }

  async function analyzeUpload() {
    if (!file || busy || compressing) return;
    if (file.size > 40 * 1024 * 1024) {
      setError('Batas file analisis 40 MB. Kompres PDF terlebih dahulu.');
      return;
    }
    if (!/\.(pdf|txt)$/i.test(file.name)) {
      setError('Pilih file PDF atau TXT.');
      return;
    }

    const current = ++generation.current;
    setBusy(true);
    resetDraft();

    try {
      const pdf = await preparePdfText(
        file,
        forceOcr,
        message => {
          if (generation.current === current) setProgress(message);
        }
      );
      if (current !== generation.current) return;

      const raw = pdf ? pdf.text : await file.text();
      const truncated = Boolean(pdf?.truncated) || raw.length > 90000;
      if (truncated) {
        setWarning(
          'Dokumen terlalu panjang: analisis hanya mencakup bagian teks yang dikirim. Cocokkan hasil dengan dokumen lengkap.'
        );
      }

      setProgress('Menganalisis metadata dan ringkasan…');
      await requestDraft(
        { kind, text: raw.slice(0, 90000) },
        current,
        `Analisis selesai${pdf ? ` · ${pdf.pages} halaman · ${pdf.ocrPages} halaman OCR` : ''}.`
      );
    } catch (err) {
      if (current === generation.current) {
        setError(err instanceof Error ? err.message : 'Analisis gagal.');
      }
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }

  const indexedTextAvailable =
    sourceTextLength === undefined ||
    sourceTextLength === null ||
    sourceTextLength > 0;

  return (
    <section className="m-5 min-w-0 rounded-2xl border border-sky-200 bg-sky-50 p-4 md:m-6">
      <h3 className="font-bold text-slate-900">Asisten AI Dokumen</h3>
      <p className="mt-1 text-sm text-slate-600">
        Gunakan artefak yang sudah ada atau unggah PDF/TXT untuk usulan pengisian field dan ringkasan.
        PDF scan dibaca dengan OCR Indonesia/Inggris. Maksimal 40 MB dan 300 halaman PDF.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        AI hanya membuat draft. Nomor, tanggal, owner, cakupan dan ringkasan tetap harus divalidasi terhadap dokumen asli.
      </p>

      {sourceDocumentId && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-3">
          <div className="text-xs font-black uppercase tracking-[0.08em] text-emerald-700">
            Artefak TotalARC terpilih
          </div>
          <div className="mt-1 break-words text-sm font-bold text-slate-900">
            {sourceTitle || sourceDocumentId}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {typeof sourceTextLength === 'number'
              ? sourceTextLength.toLocaleString('id-ID') + ' karakter terindeks'
              : 'Teks terindeks akan diperiksa saat analisis'}
          </div>
          <button
            type="button"
            disabled={busy || compressing || !indexedTextAvailable}
            onClick={analyzeStoredArtifact}
            className="mt-3 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Memproses artefak…' : 'Analisis AI Artefak Terdaftar'}
          </button>
          {!indexedTextAvailable && (
            <p className="mt-2 text-xs font-semibold text-amber-700">
              Artefak belum memiliki teks terindeks. Gunakan upload PDF di bawah dan jalankan OCR.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 border-t border-sky-200 pt-4">
        <div className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">
          {sourceDocumentId ? 'Atau analisis file baru' : 'Analisis file'}
        </div>
        <input
          aria-label="Dokumen untuk analisis AI"
          type="file"
          accept=".pdf,.txt"
          disabled={busy || compressing}
          onChange={event => choose(event.target.files?.[0] || null)}
          className="mt-3 block w-full min-w-0 text-sm"
        />
        <PdfCompressControl
          file={file}
          disabled={busy}
          onChange={choose}
          onBusyChange={setCompressing}
        />
        <label className="my-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={forceOcr}
            disabled={busy || compressing}
            onChange={event => setForceOcr(event.target.checked)}
          />
          OCR seluruh halaman (untuk PDF campuran/teks rusak)
        </label>
        <button
          type="button"
          disabled={!file || busy || compressing}
          onClick={analyzeUpload}
          className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Memproses dokumen…' : 'Kompres/OCR & Analisis AI'}
        </button>
      </div>

      <p role="status" className="mt-2 text-sm text-slate-600">{progress}</p>
      {warning && <p className="mt-2 text-sm text-amber-800">{warning}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}

      {draft && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-bold">
            Draft AI — periksa terhadap dokumen asli sebelum digunakan.
          </p>
          <p className="break-words text-xs text-slate-500">
            {provider}. Field terpilih akan menggantikan isian yang ada; status persetujuan tetap mengikuti form.
          </p>
          {Object.entries(draft).map(([key, value]) => (
            <div key={key}>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={Boolean(selected[key])}
                  onChange={event =>
                    setSelected({ ...selected, [key]: event.target.checked })
                  }
                />
                {labels[key] || key}
              </label>
              <textarea
                aria-label={labels[key] || key}
                value={value}
                rows={key === 'summary' ? 6 : 2}
                onChange={event =>
                  setDraft({ ...draft, [key]: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
              />
            </div>
          ))}
          <button
            type="button"
            disabled={!Object.values(selected).some(Boolean)}
            onClick={() => {
              onApply(
                Object.fromEntries(
                  Object.entries(draft).filter(([key]) => selected[key])
                )
              );
              setDraft(null);
              setProgress(
                'Usulan diterapkan ke form. Periksa kembali lalu tekan Simpan.'
              );
            }}
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            Gunakan Field Terpilih
          </button>
        </div>
      )}
    </section>
  );
}
