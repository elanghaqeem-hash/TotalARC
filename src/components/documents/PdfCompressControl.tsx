'use client';

import { useEffect, useRef, useState } from 'react';
import {
  compressPdf,
  preloadPdfCompression,
  type PdfCompressionQuality
} from '@/lib/pdf-compress-client';

type Props = { file: File | null; disabled?: boolean; onChange: (file: File) => void; onBusyChange: (busy: boolean) => void };
const size = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + ' MB';

function isChunkLoadError(error: unknown) {
  const text = error instanceof Error ? error.name + ' ' + error.message : String(error || '');
  return /ChunkLoadError|Loading chunk .* failed|dynamically imported module|module script failed/i.test(text);
}

export function PdfCompressControl({ file, disabled, onChange, onBusyChange }: Props) {
  const [quality, setQuality] = useState<PdfCompressionQuality>('balanced');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<File | null>(null);
  const [staleAssets, setStaleAssets] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    setResult(null);
    setMessage('');
    setError('');
    setStaleAssets(false);

    if (file && /\.pdf$/i.test(file.name)) {
      void preloadPdfCompression().catch(error => {
        if (isChunkLoadError(error)) {
          setStaleAssets(true);
          setError('Versi TotalARC di browser sudah tertinggal dari deployment terbaru. Muat ulang TotalARC, pilih kembali file, lalu jalankan kompresi.');
        }
      });
    }

    return () => abort.current?.abort();
  }, [file]);
  useEffect(() => () => { abort.current?.abort(); }, []);
  if (!file || !/\.pdf$/i.test(file.name)) return null;
  const start = async () => {
    if (busy || disabled) return;
    const controller = new AbortController(); abort.current = controller;
    setBusy(true); onBusyChange(true); setError(''); setResult(null);
    try {
      const compressed = await compressPdf(file, quality, setMessage, controller.signal);
      if (controller.signal.aborted) return;
      if (compressed.reduced) {
        setResult(compressed.file);
        setMessage(`${size(file.size)} → ${size(compressed.file.size)} · hemat ${Math.round((1 - compressed.file.size / file.size) * 100)}%`);
      } else setMessage('PDF sudah cukup ringkas. File asli tetap digunakan karena hasil kompresi tidak lebih kecil.');
    } catch (error) {
      if (!controller.signal.aborted) {
        if (isChunkLoadError(error)) {
          setStaleAssets(true);
          setError('Versi TotalARC di browser sudah tertinggal dari deployment terbaru. Muat ulang TotalARC, pilih kembali file, lalu jalankan kompresi.');
        } else {
          setError(error instanceof Error ? error.message : 'Kompresi PDF gagal.');
        }
        setMessage('');
      }
    } finally { if (controller.signal.aborted) setMessage('Kompresi dibatalkan.'); setBusy(false); onBusyChange(false); }
  };
  const preview = () => {
    if (!result) return;
    const url = URL.createObjectURL(result);
    const link = document.createElement('a'); link.href = url; link.download = result.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  return <div className="my-3 min-w-0 rounded-xl border border-sky-200 bg-sky-50/50 p-3 text-xs">
    <div className="mb-2 font-bold text-slate-800">Kompres PDF · {size(file.size)}</div>
    <p className="mb-2 break-all text-slate-600">File untuk diunggah: {file.name}</p>
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Kualitas kompresi PDF" value={quality} disabled={busy || disabled} onChange={event => { setQuality(event.target.value as PdfCompressionQuality); setResult(null); setMessage(''); }} className="min-w-0 rounded-lg border border-slate-200 bg-white p-2">
        <option value="high">Kualitas tinggi</option><option value="balanced">Seimbang</option><option value="small">Ukuran terkecil</option>
      </select>
      <button type="button" onClick={start} disabled={busy || disabled} className="rounded-lg bg-sky-700 px-3 py-2 font-bold text-white disabled:opacity-50">{busy ? 'Mengompres…' : 'Kompres PDF'}</button>
      {busy && <button type="button" onClick={() => { abort.current?.abort(); setMessage('Membatalkan…'); }} className="underline">Batalkan</button>}
    </div>
    <p className="mt-2 text-slate-600">Kompresi berlangsung di perangkat Anda dan mendukung sampai 300 halaman per PDF. Paling efektif untuk PDF scan. Pilih kualitas tinggi untuk teks kecil dan tabel; periksa hasil sebelum digunakan.</p>
    {message && <p role="status" aria-live="polite" className="mt-2 font-semibold text-sky-800">{message}</p>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {staleAssets && <button type="button" onClick={() => window.location.reload()} className="mt-2 rounded-lg border border-red-200 bg-white px-3 py-2 font-bold text-red-700">Muat ulang TotalARC</button>}
    {result && <div className="mt-2 flex flex-wrap gap-3">
      <button type="button" onClick={preview} className="underline">Unduh untuk diperiksa</button>
      <button type="button" disabled={disabled} onClick={() => { onChange(result); setResult(null); }} className="rounded-lg bg-emerald-700 px-3 py-2 font-bold text-white disabled:opacity-50">Gunakan hasil kompresi</button>
    </div>}
  </div>;
}
