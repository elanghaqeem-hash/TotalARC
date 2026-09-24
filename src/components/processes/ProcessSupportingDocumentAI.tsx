'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  GitBranch,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload
} from 'lucide-react';

type Props = {
  process: any;
  onUseSuggestions: (draft: any) => void;
  onApplied: () => void | Promise<void>;
};

const MAX_BYTES = 8 * 1024 * 1024;

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return (value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1) + ' ' + units[index];
}

function statusTone(status: string) {
  if (status === 'APPLIED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'REJECTED') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export function ProcessSupportingDocumentAI({ process, onUseSuggestions, onApplied }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [activeAnalysis, setActiveAnalysis] = useState<any>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [replaceActivities, setReplaceActivities] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const processId = String(process?.id || '');
  const existingActivityCount = Number(process?.activities?.length || 0);
  const draft = activeAnalysis?.draft || null;

  const loadHistory = async () => {
    if (!processId) return;
    setLoadingHistory(true);
    try {
      const response = await fetch(
        '/api/processes/' + encodeURIComponent(processId) + '/supporting-documents',
        { cache: 'no-store' }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load supporting documents.');
      const next = Array.isArray(payload.analyses) ? payload.analyses : [];
      setAnalyses(next);
      setActiveAnalysis(current => {
        if (current?.id && next.some((item: any) => item.id === current.id)) {
          return next.find((item: any) => item.id === current.id) || current;
        }
        return next.find((item: any) => item.status === 'PENDING_USER_VALIDATION') || null;
      });
    } catch {
      // History is supporting context only; do not block editing the process form.
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    setFile(null);
    setActiveAnalysis(null);
    setError('');
    setMessage('');
    setReplaceActivities(existingActivityCount === 0);
    if (fileRef.current) fileRef.current.value = '';
    void loadHistory();
  }, [processId]);

  const analyze = async () => {
    if (!file || !processId || analyzing) return;
    setError('');
    setMessage('');

    if (file.size > MAX_BYTES) {
      setError('File melebihi batas 8 MB.');
      return;
    }

    setAnalyzing(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(
        '/api/processes/' + encodeURIComponent(processId) + '/supporting-documents',
        { method: 'POST', body: form }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload.error ||
            (payload.evidenceStored
              ? 'File tersimpan, tetapi analisis AI belum berhasil.'
              : 'Upload dan analisis gagal.')
        );
      }

      setActiveAnalysis(payload.analysis);
      setAnalyses(current => [
        payload.analysis,
        ...current.filter(item => item.id !== payload.analysis?.id)
      ]);
      setMessage(
        'Dokumen tersimpan di Evidence Repository. Draft AI siap direview; belum ada data BPM yang diubah.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload dan analisis gagal.');
    } finally {
      setAnalyzing(false);
    }
  };

  const apply = async () => {
    if (!activeAnalysis?.id || applying) return;
    setApplying(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        '/api/processes/' + encodeURIComponent(processId) + '/supporting-documents',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actionType: 'APPLY',
            analysisId: activeAnalysis.id,
            replaceActivities
          })
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'AI draft could not be applied.');

      setMessage(
        payload.result?.activityReplacementSkipped
          ? 'Master, objective, dan SIPOC diterapkan. Activity Register lama dipertahankan karena opsi replacement tidak dipilih.'
          : 'Draft telah divalidasi dan diterapkan. Flowchart tersimpan dan dapat digunakan kembali tanpa AI.'
      );
      await loadHistory();
      await onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI draft could not be applied.');
    } finally {
      setApplying(false);
    }
  };

  const reject = async () => {
    if (!activeAnalysis?.id || rejecting) return;
    setRejecting(true);
    setError('');
    try {
      const response = await fetch(
        '/api/processes/' + encodeURIComponent(processId) + '/supporting-documents',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionType: 'REJECT', analysisId: activeAnalysis.id })
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to reject this AI draft.');
      setMessage('Draft AI ditolak. File sumber tetap tersimpan sebagai supporting evidence.');
      setActiveAnalysis(null);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reject this AI draft.');
    } finally {
      setRejecting(false);
    }
  };

  return (
    <section className="rounded-xl border border-sky-200 bg-sky-50/40 p-3">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 shadow-sm ring-1 ring-sky-100">
          <Upload className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-[11px] font-black text-slate-900">
              Supporting Document & AI Process Definition
            </h4>
            <span className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-sky-700">
              Review before apply
            </span>
          </div>
          <p className="mt-1 text-[9px] leading-4 text-slate-500">
            Upload SOP atau catatan proses. File asli disimpan sebagai evidence; ARC AI membuat draft BPM
            dan flowchart tanpa langsung menimpa Process Master.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[9px] leading-4 text-rose-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {message && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[9px] leading-4 text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {message}
        </div>
      )}

      <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-3">
        <input
          ref={fileRef}
          type="file"
          accept=".docx,.pdf,.txt,.pptx,.jpg,.jpeg,.png,.xlsx"
          onChange={event => {
            const selected = event.target.files?.[0] || null;
            setFile(selected);
            setError('');
            setMessage('');
          }}
          className="block w-full text-[9px] text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-[9px] file:font-black file:text-slate-700 hover:file:bg-slate-200"
        />
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[8px] leading-3.5 text-slate-400">
            DOCX · PDF · TXT · PPTX · JPG/JPEG · PNG · XLSX · max 8 MB
            {file ? (
              <span className="ml-1 font-bold text-slate-600">
                — {file.name} ({formatBytes(file.size)})
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void analyze()}
            disabled={!file || analyzing}
            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-sky-500 px-3 text-[9px] font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {analyzing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {analyzing ? 'Analyzing…' : 'Upload & Analyze'}
          </button>
        </div>
      </div>

      {draft && activeAnalysis && (
        <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-black text-slate-900">AI BPM Draft</div>
              <div className="mt-0.5 text-[8px] text-slate-400">
                {activeAnalysis.fileName} · confidence {draft.confidence || 'Not Assessed'} ·{' '}
                {activeAnalysis.extractionMethod}
              </div>
            </div>
            <span className={`rounded-full border px-2 py-1 text-[8px] font-black ${statusTone(activeAnalysis.status)}`}>
              {activeAnalysis.status === 'PENDING_USER_VALIDATION'
                ? 'PENDING VALIDATION'
                : activeAnalysis.status}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-2.5">
              <div className="text-[8px] font-black uppercase tracking-wide text-slate-400">
                Suggested master
              </div>
              <div className="mt-1 text-[10px] font-black text-slate-800">
                {draft.master?.name || process.name}
              </div>
              <div className="mt-1 text-[9px] leading-4 text-slate-500">
                Owner: {draft.master?.ownerName || 'Not provided'}
                <br />
                Criticality: {draft.master?.criticality || 'Not Assessed'} · Classification:{' '}
                {draft.master?.classification || 'Not Assessed'}
                <br />
                Category suggestion: {draft.master?.categorySuggestion || 'Not provided'}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <div className="text-[8px] font-black uppercase tracking-wide text-slate-400">
                Process objective
              </div>
              <div className="mt-1 text-[9px] leading-4 text-slate-600">
                {draft.objective?.objective || 'Not supported by source document.'}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
            <div className="mb-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-slate-500">
              <GitBranch className="h-3.5 w-3.5 text-brand-600" />
              AI Flowchart Preview ({draft.activities?.length || 0} steps)
            </div>
            <div className="mx-auto max-w-md">
              <div className="mx-auto w-fit rounded-full bg-brand-600 px-3 py-1.5 text-[8px] font-black text-white">
                START
              </div>
              {(draft.activities || []).map((activity: any, index: number) => (
                <React.Fragment key={activity.activityId || index}>
                  <div className="mx-auto h-4 w-px bg-slate-300" />
                  <div
                    className={`rounded-xl border bg-white px-3 py-2.5 shadow-sm ${
                      activity.kind === 'decision'
                        ? 'border-amber-300'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-50 text-[8px] font-black text-sky-700">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[9px] font-black leading-4 text-slate-800">
                          {activity.name}
                        </div>
                        <div className="mt-0.5 text-[8px] leading-3.5 text-slate-400">
                          {activity.performer ? 'Performer: ' + activity.performer : 'Performer not provided'}
                          {activity.systemUsed ? ' · System: ' + activity.systemUsed : ''}
                        </div>
                      </div>
                      {activity.kind === 'decision' && (
                        <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-[7px] font-black text-amber-700">
                          DECISION
                        </span>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              ))}
              <div className="mx-auto h-4 w-px bg-slate-300" />
              <div className="mx-auto w-fit rounded-full bg-slate-900 px-3 py-1.5 text-[8px] font-black text-white">
                END
              </div>
            </div>
          </div>

          {(draft.gaps?.length > 0 || draft.assumptions?.length > 0) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[8px] leading-3.5 text-amber-800">
              {draft.gaps?.length > 0 && (
                <div>
                  <strong>Source gaps:</strong> {draft.gaps.join(' · ')}
                </div>
              )}
              {draft.assumptions?.length > 0 && (
                <div className={draft.gaps?.length ? 'mt-1' : ''}>
                  <strong>AI assumptions to validate:</strong> {draft.assumptions.join(' · ')}
                </div>
              )}
            </div>
          )}

          {activeAnalysis.status === 'PENDING_USER_VALIDATION' && existingActivityCount > 0 && (
            <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-[8px] leading-3.5 text-amber-800">
              <input
                type="checkbox"
                checked={replaceActivities}
                onChange={event => setReplaceActivities(event.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-amber-300 text-brand-600"
              />
              <span>
                <strong>Replace existing Activity Register ({existingActivityCount} steps)</strong>.
                Total ARC akan memblokir replacement bila Risk atau Control sudah mereferensikan
                activity lama. Jika tidak dicentang, activity lama dipertahankan.
              </span>
            </label>
          )}

          {activeAnalysis.status === 'PENDING_USER_VALIDATION' ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => onUseSuggestions(draft)}
                className="min-h-9 rounded-lg border border-sky-200 bg-sky-50 px-3 text-[9px] font-black text-sky-700 hover:bg-sky-100"
              >
                Use Master Suggestions
              </button>
              <button
                type="button"
                onClick={() => void reject()}
                disabled={rejecting || applying}
                className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-[9px] font-black text-slate-600 disabled:opacity-50"
              >
                {rejecting ? 'Rejecting…' : 'Reject Draft'}
              </button>
              <button
                type="button"
                onClick={() => void apply()}
                disabled={applying || rejecting}
                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-[9px] font-black text-white disabled:opacity-50"
              >
                {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {applying ? 'Applying…' : 'Validate & Apply BPM'}
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[8px] leading-3.5 text-slate-500">
              Draft dan flow preview ini tersimpan di Total ARC dan dapat dilihat kembali tanpa
              menjalankan AI ulang.
            </div>
          )}
        </div>
      )}

      {analyses.length > 0 && (
        <div className="mt-3 border-t border-sky-100 pt-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[8px] font-black uppercase tracking-wide text-slate-400">
              Supporting document history
            </span>
            <button
              type="button"
              onClick={() => void loadHistory()}
              disabled={loadingHistory}
              className="text-slate-400 hover:text-brand-600 disabled:opacity-50"
              aria-label="Refresh document analysis history"
            >
              <RefreshCw className={`h-3 w-3 ${loadingHistory ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="space-y-1">
            {analyses.slice(0, 4).map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveAnalysis(item)}
                className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[8px] font-bold text-slate-700">{item.fileName}</div>
                  <div className="mt-0.5 text-[7px] text-slate-400">
                    {item.aiProvider || 'AI'} · {new Date(item.createdAt).toLocaleDateString('id-ID')}
                  </div>
                </div>
                <span className={`rounded-full border px-1.5 py-0.5 text-[7px] font-black ${statusTone(item.status)}`}>
                  {item.status === 'PENDING_USER_VALIDATION' ? 'PENDING' : item.status}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
