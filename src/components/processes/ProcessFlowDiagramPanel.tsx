'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  History,
  Loader2,
  Maximize2,
  RefreshCw,
  Sparkles,
  X
} from 'lucide-react';
import { useRole } from '@/context/RoleContext';

type FlowDiagram = {
  id: string;
  versionNo: number;
  title: string;
  summary?: string | null;
  svgText: string;
  sourceHash: string;
  isActive: boolean;
  aiProvider?: string | null;
  aiModel?: string | null;
  generatedBy?: string | null;
  createdAt: string;
};

type FlowHistoryItem = {
  id: string;
  versionNo: number;
  title: string;
  status: string;
  isActive: boolean;
  sourceHash: string;
  aiProvider?: string | null;
  aiModel?: string | null;
  generatedBy?: string | null;
  createdAt: string;
};

type Workspace = {
  diagram: FlowDiagram | null;
  history: FlowHistoryItem[];
  stale: boolean;
  activityCount: number;
  currentSourceHash: string;
  reusable?: boolean;
  aiRequiredToLihat?: boolean;
};

function safeFileName(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'total-arc-process-flow'
  );
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function ProcessFlowDiagramPanel({ process }: { process: any }) {
  const { currentUser } = useRole();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [activatingId, setActivatingId] = useState('');
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const canGenerate = currentUser.role === 'Admin' || currentUser.role === 'ProcessOwner';
  const processId = String(process?.id || '');
  const diagram = workspace?.diagram || null;
  const activityCount = Number(process?.activities?.length || workspace?.activityCount || 0);

  const svgDataUrl = useMemo(() => {
    if (!diagram?.svgText) return '';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(diagram.svgText);
  }, [diagram?.svgText]);

  const loadWorkspace = async () => {
    if (!processId) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        '/api/processes/' + encodeURIComponent(processId) + '/flow-diagram',
        { cache: 'no-store' }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load saved process flow.');
      setWorkspace(payload as Workspace);
    } catch (err) {
      setWorkspace(null);
      setError(err instanceof Error ? err.message : 'Unable to load saved process flow.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setWorkspace(null);
    setHistoryOpen(false);
    setFullscreen(false);
    void loadWorkspace();
  }, [processId]);

  const generate = async () => {
    if (!processId || generating) return;
    setGenerating(true);
    setError('');
    try {
      const response = await fetch(
        '/api/processes/' + encodeURIComponent(processId) + '/flow-diagram',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionType: 'GENERATE' })
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to generate process flow.');
      setWorkspace(payload as Workspace);
      setHistoryOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate process flow.');
    } finally {
      setGenerating(false);
    }
  };

  const activate = async (diagramId: string) => {
    if (!diagramId || activatingId) return;
    setActivatingId(diagramId);
    setError('');
    try {
      const response = await fetch(
        '/api/processes/' + encodeURIComponent(processId) + '/flow-diagram',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionType: 'ACTIVATE', diagramId })
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to activate saved flow.');
      setWorkspace(payload as Workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to activate saved flow.');
    } finally {
      setActivatingId('');
    }
  };

  const downloadSvg = () => {
    if (!diagram?.svgText) return;
    triggerDownload(
      new Blob([diagram.svgText], { type: 'image/svg+xml;charset=utf-8' }),
      safeFileName(process?.processId || process?.name || 'process-flow') +
        '-v' +
        diagram.versionNo +
        '.svg'
    );
  };

  const downloadPng = async () => {
    if (!diagram?.svgText) return;
    setError('');
    const source = URL.createObjectURL(
      new Blob([diagram.svgText], { type: 'image/svg+xml;charset=utf-8' })
    );

    try {
      const image = new Image();
      const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Unable to render PNG from the saved SVG.'));
      });
      image.src = source;
      await loaded;

      const scale = 1.5;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('PNG export is not supported by this browser.');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      const pngBlob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, 'image/png', 1)
      );
      if (!pngBlob) throw new Error('Unable to create PNG file.');

      triggerDownload(
        pngBlob,
        safeFileName(process?.processId || process?.name || 'process-flow') +
          '-v' +
          diagram.versionNo +
          '.png'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to download PNG.');
    } finally {
      URL.revokeObjectURL(source);
    }
  };

  const createdLabel = diagram?.createdAt
    ? new Date(diagram.createdAt).toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : '';

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-sky-50/60 p-3.5 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xs font-black uppercase tracking-[0.1em] text-slate-700">
                  Diagram Alur Proses
                </h3>
                {diagram && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" />
                    Tersimpan · dapat digunakan kembali tanpa AI
                  </span>
                )}
              </div>
              <p className="mt-1 text-[10px] leading-4 text-slate-500 sm:text-[11px]">
                AI menyusun visual dari Register Aktivitas satu kali. Hasil disimpan per institusi dan dapat dibuka atau diunduh kembali tanpa memanggil AI.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
              {diagram && (
                <button
                  type="button"
                  onClick={() => setHistoryOpen(current => !current)}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-600 transition hover:bg-slate-50"
                >
                  <History className="h-3.5 w-3.5" />
                  Versi
                </button>
              )}
              {canGenerate && (
                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={generating || activityCount === 0}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-600 to-sky-500 px-3 text-[10px] font-black text-white shadow-sm shadow-sky-100 transition hover:from-brand-700 hover:to-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : diagram ? (
                    <RefreshCw className="h-3.5 w-3.5" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {generating ? 'Membuat…' : diagram ? 'Buat Ulang' : 'Buat & Simpan'}
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-3.5 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[10px] leading-4 text-rose-700 sm:mx-4 sm:text-[11px]">
            {error}
          </div>
        )}

        {workspace?.stale && diagram && (
          <div className="mx-3.5 mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[10px] leading-4 text-amber-800 sm:mx-4 sm:text-[11px]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Activity Register sudah berubah setelah diagram ini dibuat. Diagram lama tetap dapat
              digunakan; pilih <strong>Buat Ulang</strong> hanya bila ingin memperbarui visualnya.
            </span>
          </div>
        )}

        <div className="p-3.5 sm:p-4">
          {loading ? (
            <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Memuat alur tersimpan…
            </div>
          ) : diagram ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[10px] sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate font-black text-slate-800">
                    Versi {diagram.versionNo} · {diagram.title}
                  </div>
                  <div className="mt-0.5 text-slate-400">
                    {createdLabel}
                    {diagram.generatedBy ? ' · ' + diagram.generatedBy : ''}
                    {diagram.aiProvider ? ' · AI ' + diagram.aiProvider : ''}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:flex">
                  <button
                    type="button"
                    onClick={() => setFullscreen(true)}
                    className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[9px] font-bold text-slate-600 hover:bg-slate-50"
                  >
                    <Maximize2 className="h-3 w-3" />
                    Lihat
                  </button>
                  <button
                    type="button"
                    onClick={downloadSvg}
                    className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[9px] font-bold text-slate-600 hover:bg-slate-50"
                  >
                    <Download className="h-3 w-3" />
                    SVG
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadPng()}
                    className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[9px] font-bold text-slate-600 hover:bg-slate-50"
                  >
                    <Download className="h-3 w-3" />
                    PNG
                  </button>
                </div>
              </div>

              {diagram.summary && (
                <p className="rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2.5 text-[10px] leading-4 text-slate-600 sm:text-[11px]">
                  {diagram.summary}
                </p>
              )}

              <button
                type="button"
                onClick={() => setFullscreen(true)}
                className="block w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100/60 text-left"
                aria-label="Buka alur proses tersimpan dalam layar penuh"
              >
                <div className="max-h-[520px] overflow-auto p-2 sm:p-3">
                  <img
                    src={svgDataUrl}
                    alt={'Saved process flow: ' + diagram.title}
                    className="mx-auto h-auto w-full max-w-[900px] rounded-lg bg-white shadow-sm"
                  />
                </div>
              </button>

              <div className="text-center text-[9px] leading-4 text-slate-400">
                Ketuk diagram untuk tampilan penuh. Diagram ini disimpan di Total ARC dan tidak membutuhkan AI untuk dibuka kembali.
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center">
              <Sparkles className="mx-auto h-6 w-6 text-brand-500" />
              <div className="mt-2 text-xs font-black text-slate-800">
                Belum ada diagram alur proses tersimpan
              </div>
              <p className="mx-auto mt-1 max-w-md text-[10px] leading-4 text-slate-500 sm:text-[11px]">
                {activityCount > 0
                  ? 'Buat diagram dari Register Aktivitas. Setelah tersimpan, pengguna berikutnya dapat melihat dan mengunduhnya tanpa menggunakan AI lagi.'
                  : 'Register Aktivitas masih kosong. Lengkapi atau validasi aktivitas terlebih dahulu sebelum membuat alur.'}
              </p>
              {canGenerate && activityCount > 0 && (
                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={generating}
                  className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-sky-500 px-4 text-[10px] font-black text-white shadow-sm shadow-sky-100 disabled:opacity-50"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Buat & Simpan Flow
                </button>
              )}
            </div>
          )}

          {historyOpen && Boolean(workspace?.history?.length) && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
              <div className="px-1 pb-2 text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                Versi tersimpan
              </div>
              <div className="space-y-1.5">
                {workspace!.history.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[10px] font-black text-slate-700">
                        Versi {item.versionNo} · {item.title}
                      </div>
                      <div className="mt-0.5 text-[9px] text-slate-400">
                        {new Date(item.createdAt).toLocaleDateString('id-ID')}
                        {item.aiProvider ? ' · ' + item.aiProvider : ''}
                      </div>
                    </div>
                    {item.isActive ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-black text-emerald-700">
                        AKTIF
                      </span>
                    ) : canGenerate ? (
                      <button
                        type="button"
                        disabled={Boolean(activatingId)}
                        onClick={() => void activate(item.id)}
                        className="min-h-8 rounded-lg border border-brand-200 bg-brand-50 px-2.5 text-[9px] font-black text-brand-700 disabled:opacity-50"
                      >
                        {activatingId === item.id ? 'Activating…' : 'Jadikan Aktif'}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {fullscreen && diagram && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950/75 p-2 backdrop-blur-sm sm:p-4">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between rounded-t-2xl border border-slate-200 bg-white px-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-xs font-black text-slate-900">{diagram.title}</div>
              <div className="text-[9px] text-slate-400">Versi {diagram.versionNo} · Tersimpan di Total ARC</div>
            </div>
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="ml-3 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"
              aria-label="Tutup alur proses"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mx-auto w-full max-w-6xl flex-1 overflow-auto rounded-b-2xl border-x border-b border-slate-200 bg-slate-100 p-2 sm:p-4">
            <img
              src={svgDataUrl}
              alt={'Saved process flow: ' + diagram.title}
              className="mx-auto h-auto min-w-[680px] max-w-[1000px] rounded-xl bg-white shadow-xl"
            />
          </div>
        </div>
      )}
    </>
  );
}
