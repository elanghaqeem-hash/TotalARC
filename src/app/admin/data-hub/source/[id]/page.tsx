'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Database,
  FileSearch,
  HardDrive,
  ShieldCheck
} from 'lucide-react';

type SourceDetail = {
  document?: Record<string, any>;
  text?: string;
  chunks?: Array<Record<string, any>>;
  page?: number;
  pageSize?: number;
  totalChunks?: number;
  totalPages?: number;
  hasIndexedText?: boolean;
  hasRawBytes?: boolean;
};

function humanBytes(value: unknown) {
  const bytes = Number(value || 0);
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

export default function SourceDocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const documentId = String(params?.id || '');
  const [data, setData] = useState<SourceDetail>({});
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({
        documentId,
        page: String(page),
        pageSize: '8'
      });
      const response = await fetch('/api/admin/data-hub/source?' + query.toString(), {
        cache: 'no-store'
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Source document could not be loaded.');
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Source document could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [documentId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const document = data.document || {};
  const totalPages = Math.max(1, Number(data.totalPages || 1));

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Link
          href="/admin/data-hub"
          className="inline-flex items-center gap-1.5 text-[11px] font-black text-slate-500 hover:text-brand-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Data Integration Hub
        </Link>

        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-sky-600">
              <FileSearch className="h-4 w-4" />
              Source Artifact · Full Indexed View
            </div>
            <h1 className="mt-1 break-words text-2xl font-black text-slate-900">
              {loading ? 'Loading source…' : document.title || 'Source document'}
            </h1>
            <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-500">
              Tampilan ini membaca artefak persisten langsung dari Cloudflare D1. Teks ditampilkan
              per chunk agar file besar tetap cepat dibuka tanpa menghilangkan bagian sumber.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {document.sourceRole && (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-black text-sky-700">
                {document.sourceRole} · P{Number(document.precedencePriority || 0)}
              </span>
            )}
            {document.module && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                {document.module}
              </span>
            )}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <Database className="h-4 w-4 text-sky-600" />
              <div className="mt-2 text-[10px] font-bold uppercase text-slate-400">Source account</div>
              <div className="mt-1 break-words text-xs font-black text-slate-800">
                {document.sourceAccount || 'Not identified'}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <HardDrive className="h-4 w-4 text-sky-600" />
              <div className="mt-2 text-[10px] font-bold uppercase text-slate-400">Raw source</div>
              <div className="mt-1 text-xs font-black text-slate-800">
                {data.hasRawBytes ? humanBytes(document.rawSizeBytes) : 'Not stored'}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <FileSearch className="h-4 w-4 text-sky-600" />
              <div className="mt-2 text-[10px] font-bold uppercase text-slate-400">Indexed text</div>
              <div className="mt-1 text-xs font-black text-slate-800">
                {Number(document.textLength || 0).toLocaleString('id-ID')} chars
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <ShieldCheck className="h-4 w-4 text-sky-600" />
              <div className="mt-2 text-[10px] font-bold uppercase text-slate-400">Sensitivity</div>
              <div className="mt-1 text-xs font-black text-slate-800">
                {document.sensitivity || 'Confidential'}
              </div>
            </div>
          </section>

          {!data.hasIndexedText ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div>
                  <div className="text-sm font-black text-amber-900">Indexed text belum tersedia</div>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    Artefak tetap tercatat di Source Coverage. Kondisi ini harus muncul sebagai
                    exception TEXT_NOT_INDEXED dan tidak boleh dianggap data lengkap.
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-black text-slate-900">Indexed source text</div>
                  <div className="mt-0.5 text-[10px] text-slate-500">
                    Page {Number(data.page || 1)} of {totalPages} · {Number(data.totalChunks || 0)} chunks
                  </div>
                </div>
                <div className="text-[10px] font-bold text-slate-400">
                  Read-only · provenance preserved
                </div>
              </div>
              <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words p-4 text-[11px] leading-5 text-slate-700">
                {data.text || ''}
              </pre>
              <div className="flex items-center justify-between border-t border-slate-200 p-3">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(value => Math.max(1, value - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </button>
                <span className="text-[10px] font-bold text-slate-500">
                  Chunk page {Number(data.page || 1)} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(value => Math.min(totalPages, value + 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 text-[10px] text-slate-500">
            <div className="grid gap-2 md:grid-cols-2">
              <div><b className="text-slate-700">Provider:</b> {document.provider || '—'}</div>
              <div><b className="text-slate-700">Source kind:</b> {document.sourceKind || '—'}</div>
              <div><b className="text-slate-700">MIME:</b> {document.mimeType || '—'}</div>
              <div><b className="text-slate-700">Modified:</b> {document.sourceModifiedAt || '—'}</div>
              <div className="md:col-span-2">
                <b className="text-slate-700">External ID:</b>{' '}
                <span className="font-mono">{document.externalId || '—'}</span>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
