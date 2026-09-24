'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Layers,
  Plus,
  Search,
  Filter,
  ArrowRight,
  Shield,
  AlertTriangle,
  FileSpreadsheet,
  Sparkles,
  CheckCircle2,
  GitBranch,
  Target,
  Clock,
  Pencil,
  Trash2,
  X
} from 'lucide-react';
import { AIChatDrawer } from '@/components/common/AIChatDrawer';
import { DataLoadingState } from '@/components/common/DataLoadingState';
import { ProcessFlowDiagramPanel } from '@/components/processes/ProcessFlowDiagramPanel';
import { ProcessSupportingDocumentAI } from '@/components/processes/ProcessSupportingDocumentAI';

function parseProcessTags(raw: unknown): Record<string, any> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, any>;
  }
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export default function ProcessesPage() {
  const [processes, setProcesses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [newProcessModal, setNewProcessModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [editingProcess, setEditingProcess] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [processLoadError, setProcessLoadError] = useState('');
  const [processLoading, setProcessLoading] = useState(true);
  const [processDetailLoading, setProcessDetailLoading] = useState(true);
  const [processDetailError, setProcessDetailError] = useState('');
  const [draftApplying, setDraftApplying] = useState(false);
  const [draftApplyError, setDraftApplyError] = useState('');
  const [sourceDraftReviewBusy, setSourceDraftReviewBusy] = useState(false);
  const [sourceDraftReviewMessage, setSourceDraftReviewMessage] = useState('');
  const process360Ref = useRef<HTMLDivElement | null>(null);
  const processDetailRequestRef = useRef(0);

  // New process form state
  const [formData, setFormData] = useState({
    processId: '',
    name: '',
    categoryId: '',
    ownerName: '',
    criticality: 'Not Assessed',
    classification: 'Core',
    isIcofrRelevant: true,
    description: ''
  });

  const loadProcessDetail = async (process: any, scrollToDetail = false) => {
    if (!process?.id) {
      setSelectedProcess(null);
      setProcessDetailLoading(false);
      return;
    }

    const requestId = processDetailRequestRef.current + 1;
    processDetailRequestRef.current = requestId;
    setSelectedProcess(process);
    setProcessDetailLoading(true);
    setProcessDetailError('');

    if (scrollToDetail) {
      window.requestAnimationFrame(() => {
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
          process360Ref.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      });
    }

    try {
      const res = await fetch(
        `/api/processes?view=detail&id=${encodeURIComponent(String(process.id))}`,
        { cache: 'no-store' }
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Gagal memuat profil proses.');
      if (processDetailRequestRef.current !== requestId) return;
      setSelectedProcess(payload.process || process);
    } catch (error) {
      if (processDetailRequestRef.current !== requestId) return;
      console.error(error);
      setProcessDetailError(
        error instanceof Error ? error.message : 'Gagal memuat profil proses.'
      );
    } finally {
      if (processDetailRequestRef.current === requestId) {
        setProcessDetailLoading(false);
      }
    }
  };

  const loadProcesses = async (preferredProcessId?: string, preferredCategoryId?: string) => {
    setProcessLoading(true);
    setProcessLoadError('');
    try {
      const res = await fetch('/api/processes?view=list', { cache: 'no-store' });
      if (!res.ok) throw new Error('Gagal memuat daftar proses bisnis.');
      const data = await res.json();

      const nextProcesses = Array.isArray(data.processes) ? data.processes : [];
      const nextCategories = Array.isArray(data.categories) ? data.categories : [];
      setProcesses(nextProcesses);
      setCategories(nextCategories);

      const nextSelected =
        nextProcesses.find((process: any) => process.id === preferredProcessId) ||
        nextProcesses.find((process: any) => process.id === selectedProcess?.id) ||
        nextProcesses[0] ||
        null;
      setSelectedProcess(nextSelected);

      if (nextSelected) {
        void loadProcessDetail(nextSelected);
      } else {
        setProcessDetailLoading(false);
      }

      if (
        preferredCategoryId &&
        nextCategories.some((category: any) => String(category.id) === String(preferredCategoryId))
      ) {
        setSelectedCategory(String(preferredCategoryId));
      }

      setFormData(prev => ({
        ...prev,
        categoryId:
          prev.categoryId &&
          nextCategories.some((category: any) => String(category.id) === String(prev.categoryId))
            ? prev.categoryId
            : nextCategories[0]?.id || ''
      }));
    } catch (error) {
      console.error(error);
      setProcessLoadError(
        error instanceof Error ? error.message : 'Gagal memuat daftar proses bisnis.'
      );
      setProcessDetailLoading(false);
    } finally {
      setProcessLoading(false);
    }
  };

  useEffect(() => {
    loadProcesses();
  }, []);

  const openCreate = () => {
    setEditingProcess(null);
    setSaveError('');
    setFormData({
      processId: '',
      name: '',
      categoryId: categories[0]?.id || '',
      ownerName: '',
      criticality: 'Not Assessed',
      classification: 'Core',
      isIcofrRelevant: true,
      description: ''
    });
    setNewProcessModal(true);
  };

  const openEdit = (process: any) => {
    setEditingProcess(process);
    setSaveError('');
    setFormData({
      processId: process.processId || '',
      name: process.name || '',
      categoryId: process.categoryId || categories[0]?.id || '',
      ownerName: process.ownerName || '',
      criticality: process.criticality || 'Critical',
      classification: process.classification || 'Core',
      isIcofrRelevant: Boolean(process.isIcofrRelevant),
      description: process.description || ''
    });
    setNewProcessModal(true);
  };

  const closeProcessModal = () => {
    if (saving) return;
    setNewProcessModal(false);
    setEditingProcess(null);
    setSaveError('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');

    try {
      const isEditing = Boolean(editingProcess?.id);
      const res = await fetch('/api/processes', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEditing ? { id: editingProcess.id, ...formData } : formData)
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Gagal menyimpan proses.');

      await loadProcesses(
        String(payload.id || ''),
        String(payload.categoryId || formData.categoryId || '')
      );
      setNewProcessModal(false);
      setEditingProcess(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan proses.');
    } finally {
      setSaving(false);
    }
  };

  const handleInspect360 = (process: any) => {
    void loadProcessDetail(process, true);
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;

    setDeleting(true);
    setDeleteError('');

    try {
      const res = await fetch(`/api/processes?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE'
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Gagal menghapus proses.');

      const remaining = processes.filter(process => process.id !== deleteTarget.id);
      setProcesses(remaining);
      if (selectedProcess?.id === deleteTarget.id) {
        const nextSelected = remaining[0] || null;
        setSelectedProcess(nextSelected);
        if (nextSelected) void loadProcessDetail(nextSelected);
      }
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Gagal menghapus proses.');
    } finally {
      setDeleting(false);
    }
  };

  const handleApplyRcmDraft = async () => {
    const draft = selectedProcess?.rcmDraft;
    const processId = selectedProcess?.id;
    const sourceFingerprint = draft?.sourceFingerprint;

    if (!processId || !sourceFingerprint) return;

    setDraftApplying(true);
    setDraftApplyError('');
    try {
      const res = await fetch('/api/processes/rcm-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processId, sourceFingerprint })
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Gagal memvalidasi dan menerapkan draf BPM yang berasal dari RCM.');
      }

      await loadProcesses(processId);
    } catch (error) {
      setDraftApplyError(
        error instanceof Error
          ? error.message
          : 'Gagal memvalidasi dan menerapkan draf BPM yang berasal dari RCM.'
      );
    } finally {
      setDraftApplying(false);
    }
  };

  const reviewSourceBackedDraft = async (decision: 'APPROVE' | 'REJECT') => {
    if (!selectedProcess?.id) return;
    setSourceDraftReviewBusy(true);
    setSourceDraftReviewMessage('');

    try {
      const response = await fetch('/api/processes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'REVIEW_SOURCE_DRAFT',
          id: selectedProcess.id,
          decision
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Gagal meninjau draf BPM berbasis dokumen sumber.');

      setSourceDraftReviewMessage(
        decision === 'APPROVE'
          ? 'Draft BPM tervalidasi untuk penggunaan operasional. Draft RCM tetap menunggu validasi terpisah.'
          : 'Draft BPM ditolak dan tidak digunakan sebagai BPM operasional.'
      );
      await loadProcesses(String(selectedProcess.id));
    } catch (error) {
      setSourceDraftReviewMessage(
        error instanceof Error ? error.message : 'Gagal meninjau draf BPM berbasis dokumen sumber.'
      );
    } finally {
      setSourceDraftReviewBusy(false);
    }
  };

  const selectedCategoryRecord = categories.find(
    (category: any) => String(category.id) === String(selectedCategory)
  );

  const filtered = processes.filter(p => {
    const processCategoryId = String(p.categoryId || p.category?.id || '');
    const processCategoryCode = String(p.category?.code || '');
    const processCategoryName = String(p.category?.name || '');
    const selectedCategoryCode = String(selectedCategoryRecord?.code || '');
    const selectedCategoryName = String(selectedCategoryRecord?.name || '');

    const matchCat =
      selectedCategory === 'ALL' ||
      processCategoryId === String(selectedCategory) ||
      (selectedCategoryCode !== '' && processCategoryCode === selectedCategoryCode) ||
      (selectedCategoryName !== '' && processCategoryName === selectedCategoryName);

    const normalizedSearch = search.trim().toLowerCase();
    const matchSearch =
      String(p.name || '').toLowerCase().includes(normalizedSearch) ||
      String(p.processId || '').toLowerCase().includes(normalizedSearch) ||
      String(p.ownerName || '').toLowerCase().includes(normalizedSearch);

    return matchCat && matchSearch;
  });

  const selectedProcessTags = parseProcessTags(selectedProcess?.tags);
  const selectedParent = selectedProcess?.parentProcessId
    ? processes.find(process => process.id === selectedProcess.parentProcessId)
    : null;
  const selectedDetailStatus = String(selectedProcessTags.detailStatus || '');
  const selectedScopeCode = String(
    selectedProcessTags.icoFrScopingCode || selectedProcessTags.relatedIcofrScopingCode || ''
  );
  const selectedRcmDraft = selectedProcess?.rcmDraft || null;

  return (
    <div className="space-y-4 pb-2 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 md:flex-row md:items-center">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-brand-600 uppercase tracking-wider">
            <Layers className="w-4 h-4" />
            <span>Arsitektur Proses & BPM (KELOLA)</span>
          </div>
          <h1 className="mt-1 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
            Enterprise Business Process Register
          </h1>
          <p className="mt-1 text-[11px] leading-5 text-slate-500 sm:text-xs">
            Levels 0–5 Hierarchical Process Model. Single source of truth connecting activities, risks, and controls.
          </p>

          <div className="mt-2 rounded-xl border border-brand-100 bg-brand-50/50 px-3 py-2.5 text-[10px] leading-4 text-slate-500 sm:text-[11px]">
            Proses yang berasal dari dokumen sumber tetap berstatus <strong>Draf / Belum Dinilai</strong> sampai validasi Pemilik Proses selesai.
          </div>
        </div>

        <div className="grid w-full grid-cols-2 gap-2.5 md:flex md:w-auto md:items-center">
          <button
            onClick={() => setAiDrawerOpen(true)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-sky-600 px-3 py-2.5 text-center text-[11px] font-bold text-white shadow-sm shadow-brand-500/20 transition-all hover:from-brand-700 hover:to-sky-700 sm:px-4 sm:text-xs md:w-auto"
          >
            <Sparkles className="w-4 h-4 text-sky-200" />
            <span>Analisis Proses Berbasis AI</span>
          </button>

          <button
            onClick={openCreate}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-center text-[11px] font-bold text-white shadow-sm transition-all hover:bg-slate-800 sm:px-4 sm:text-xs md:w-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Daftarkan Proses</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter berdasarkan ID Proses, Nama, atau Pemilik..."
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div className="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`min-h-10 shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-[11px] font-semibold transition-colors sm:text-xs ${
              selectedCategory === 'ALL'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Categories ({processes.length})
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`min-h-10 shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-[11px] font-semibold transition-colors sm:text-xs ${
                selectedCategory === cat.id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {processLoadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          <strong className="font-black">Data proses tidak tersedia.</strong>{' '}
          {processLoadError} Please retry after the database/API connection is available.
        </div>
      )}

      {!processLoading && !processLoadError && processes.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-500 shadow-sm">
          No business processes are available for the active institution.
        </div>
      )}

      {/* Split View: List on Left, Process 360 on Right */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-12">
        {/* Left List: 5 cols */}
        <div className="space-y-4 lg:col-span-5">
          {processLoading ? (
            <DataLoadingState label="Memuat proses bisnis..." variant="list" rows={3} />
          ) : (
            filtered.map(proc => {
            const isSelected = selectedProcess?.id === proc.id;
            const processTags = parseProcessTags(proc.tags);
            const detailPending = String(processTags.detailStatus || '').includes('PENDING') ||
              String(processTags.scopeMappingStatus || '').includes('REVIEW_REQUIRED');
            return (
              <div
                key={proc.id}
                onClick={() => void loadProcessDetail(proc)}
                className={`cursor-pointer overflow-hidden rounded-2xl border p-4 transition-all sm:p-5 ${
                  isSelected
                    ? 'bg-brand-50/50 border-brand-500 shadow-md ring-1 ring-brand-400'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span className="rounded-lg bg-brand-100/70 px-2.5 py-1 font-mono text-[11px] font-black text-brand-700">
                      {proc.processId}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                        proc.criticality === 'Critical'
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : proc.criticality === 'Not Assessed'
                          ? 'border-slate-200 bg-slate-50 text-slate-600'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                      }`}
                    >
                      {proc.criticality}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                      L{proc.level}
                    </span>
                    {Boolean(processTags.sourceBacked) && (
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-700">
                        Source-backed
                      </span>
                    )}
                    {processTags.icoFrScopingCode && (
                      <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-700">
                        {processTags.icoFrScopingCode}
                      </span>
                    )}
                    {detailPending && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">
                        Detail pending
                      </span>
                    )}
                    {proc.rcmDraft?.status === 'PENDING_USER_VALIDATION' && (
                      <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[10px] font-bold text-cyan-800">
                        RCM draft pending
                      </span>
                    )}
                    {proc.isIcofrRelevant && (
                      <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-700">
                        ICOFR
                      </span>
                    )}
                    <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                      {proc.status}
                    </span>
                  </div>
                  <h3 className="mt-3 break-words text-[15px] font-black leading-5 text-slate-900 sm:text-base">
                    {proc.name}
                  </h3>
                </div>

                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                  {proc.description}
                </p>

                <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0 truncate">
                    Pemilik: <strong>{proc.ownerName || proc.orgUnit?.name || 'Belum ditetapkan'}</strong>
                  </span>
                  <div className="grid w-full grid-cols-[40px_40px_minmax(0,1fr)] items-center gap-2 sm:flex sm:w-auto sm:shrink-0">
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        openEdit(proc);
                      }}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white font-bold text-slate-600 transition hover:border-brand-200 hover:text-brand-700 sm:w-auto sm:px-3"
                      aria-label={`Update ${proc.name}`}
                    >
                      <Pencil className="w-3 h-3" />
                      <span className="hidden sm:inline">Perbarui</span>
                    </button>
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        setDeleteError('');
                        setDeleteTarget(proc);
                      }}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 font-bold text-rose-700 transition hover:bg-rose-100 sm:w-auto sm:px-3"
                      aria-label={`Delete ${proc.name}`}
                    >
                      <Trash2 className="w-3 h-3" />
                      <span className="hidden sm:inline">Hapus</span>
                    </button>
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        handleInspect360(proc);
                      }}
                      className="inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 font-bold text-brand-700 transition hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                      aria-label={`Inspect 360 degrees for ${proc.name}`}
                    >
                      <span>Inspect 360°</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
          )}
        </div>

        {/* Right Detail: Process 360 (7 cols) */}
        <div ref={process360Ref} id="process-360-detail" className="scroll-mt-24 lg:col-span-7">
          {processLoading || processDetailLoading ? (
            <DataLoadingState label="Memuat profil proses..." variant="profile" className="min-h-[220px]" />
          ) : processDetailError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-xs text-rose-700">
              <strong className="font-black">Profil proses tidak tersedia.</strong>{' '}
              {processDetailError}
            </div>
          ) : selectedProcess ? (
            <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              {/* Process Title & Metadata */}
              <div className="border-b border-slate-100 pb-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-sm font-bold text-brand-700 bg-brand-50 px-2.5 py-1 rounded border border-brand-200">
                      {selectedProcess.processId}
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">
                      Level {selectedProcess.level} Business Process
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-2 flex-wrap">
                    <button
                      type="button"
                      title="Perbarui Proses Bisnis"
                      aria-label="Perbarui Proses Bisnis"
                      onClick={() => openEdit(selectedProcess)}
                      className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:text-brand-700 hover:border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-400 transition-colors"
                    >
                      <Pencil className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      title="Hapus Proses Bisnis"
                      aria-label="Hapus Proses Bisnis"
                      onClick={() => {
                        setDeleteError('');
                        setDeleteTarget(selectedProcess);
                      }}
                      className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:text-rose-800 hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-300 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <Link
                      href="/rcm"
                      title="View in RCM"
                      aria-label="View in RCM"
                      className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-brand-200 bg-brand-50 text-brand-600 hover:text-brand-700 hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400 transition-colors"
                    >
                      <FileSpreadsheet className="w-5 h-5" />
                    </Link>
                  </div>
                </div>

                <h2 className="text-xl font-black text-slate-900 mt-2">
                  {selectedProcess.name}
                </h2>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {selectedProcess.description}
                </p>

                {(selectedProcessTags.sourceBacked || selectedScopeCode || selectedDetailStatus) && (
                  <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/50 p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-violet-700">
                        Source Governance
                      </span>
                      {selectedScopeCode && (
                        <span className="rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[10px] font-black text-indigo-700">
                          Scope {selectedScopeCode}
                        </span>
                      )}
                      {selectedDetailStatus && (
                        <span className={
                          `rounded-full border px-2 py-0.5 text-[10px] font-black ${
                            selectedDetailStatus.includes('PENDING')
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          }`
                        }>
                          {selectedDetailStatus.replaceAll('_', ' ')}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] text-slate-600 sm:grid-cols-2">
                      <div>
                        <span className="font-bold text-slate-500">Hierarchy:</span>{' '}
                        {selectedParent
                          ? `${selectedParent.processId} · ${selectedParent.name}`
                          : selectedProcess.level === 2
                          ? 'Proses utama / L2 kanonis'
                          : 'Parent not assigned'}
                      </div>
                      <div>
                        <span className="font-bold text-slate-500">Permintaan sumber:</span>{' '}
                        {selectedProcessTags.sourceRequestNo
                          ? `#${selectedProcessTags.sourceRequestNo} · ${String(selectedProcessTags.sourceRequestStatus || 'tracked').replaceAll('_', ' ')}`
                          : 'Tidak ada permintaan sumber terbuka yang tercatat pada tag BPM ini'}
                      </div>
                    </div>
                    {selectedProcessTags.scopeSourceName && (
                      <div className="mt-2 text-[11px] leading-relaxed text-slate-600">
                        <span className="font-bold text-slate-500">Cakupan sumber FY2026:</span>{' '}
                        {selectedProcessTags.scopeSourceName}
                      </div>
                    )}
                    {selectedProcessTags.sourceReference && (
                      <div className="mt-1 break-all text-[10px] text-slate-400">
                        {selectedProcessTags.sourceReference}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {selectedProcessTags.sourceBacked &&
                selectedProcessTags.sourceValidationStatus === 'PENDING_USER_VALIDATION' && (
                  <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-violet-800">
                            Source-backed BPM draft
                          </span>
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-800">
                            User validation required
                          </span>
                        </div>
                        <h3 className="mt-2 text-sm font-black text-slate-900">
                          Draft BPM menunggu validasi Pemilik Proses
                        </h3>
                        <p className="mt-1 text-[11px] leading-5 text-slate-600">
                          Isi BPM berasal dari source file dan masih berstatus draft. Gunakan Update untuk memperbaiki
                          atribut yang belum tersedia pada source. Validate &amp; Use hanya memvalidasi BPM; Draft RCM
                          tetap diproses dan divalidasi secara terpisah.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={sourceDraftReviewBusy}
                          onClick={() => openEdit(selectedProcess)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3 py-2 text-[10px] font-bold text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Update
                        </button>
                        <button
                          type="button"
                          disabled={sourceDraftReviewBusy}
                          onClick={() => reviewSourceBackedDraft('REJECT')}
                          className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-[10px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={sourceDraftReviewBusy}
                          onClick={() => reviewSourceBackedDraft('APPROVE')}
                          className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {sourceDraftReviewBusy ? 'Memproses...' : 'Validasi & Gunakan'}
                        </button>
                      </div>
                    </div>
                    {sourceDraftReviewMessage && (
                      <div className="rounded-xl border border-violet-100 bg-white p-3 text-[11px] leading-5 text-slate-700">
                        {sourceDraftReviewMessage}
                      </div>
                    )}
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-800">
                      <strong>Gerbang validasi:</strong> atribut yang tidak dinyatakan dalam dokumen sumber tetap harus
                      dikonfirmasi user. Validasi BPM tidak otomatis memvalidasi risk/control pada Draft RCM.
                    </div>
                  </div>
                )}

              {selectedRcmDraft?.status === 'PENDING_USER_VALIDATION' && (
                <div className="space-y-4 rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-cyan-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-800">
                          RCM-derived BPM draft
                        </span>
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-800">
                          User validation required
                        </span>
                      </div>
                      <h3 className="mt-2 text-sm font-black text-slate-900">
                        Draft BPM tersedia dari konteks RCM
                      </h3>
                      <p className="mt-1 text-[11px] leading-5 text-slate-600">
                        Draft ini belum mengubah Process Objective, Activity Register, maupun SIPOC operasional.
                        Tinjau isi di bawah ini terlebih dahulu. Hanya klik <strong>Validasi &amp; Terapkan</strong>{' '}
                        bila scope, urutan, role, system, input/output, dan control-point sudah dianggap memadai
                        untuk digunakan.
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-[10px] sm:min-w-[240px]">
                      <div className="rounded-xl border border-cyan-100 bg-white p-2">
                        <div className="font-black text-slate-900">
                          {selectedRcmDraft.sourceSummary?.riskCount || 0}
                        </div>
                        <div className="text-slate-500">Risiko</div>
                      </div>
                      <div className="rounded-xl border border-cyan-100 bg-white p-2">
                        <div className="font-black text-slate-900">
                          {selectedRcmDraft.sourceSummary?.controlCount || 0}
                        </div>
                        <div className="text-slate-500">Kontrol</div>
                      </div>
                      <div className="rounded-xl border border-cyan-100 bg-white p-2">
                        <div className="font-black text-slate-900">
                          {selectedRcmDraft.sourceSummary?.mappingCount || 0}
                        </div>
                        <div className="text-slate-500">Mappings</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Draft Process Narrative
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-700">
                      {selectedRcmDraft.narrative}
                    </p>
                  </div>

                  {selectedRcmDraft.missingSections?.includes('objective') && (
                    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Draft Objective
                      </div>
                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-800">
                        {selectedRcmDraft.objective}
                      </p>
                    </div>
                  )}

                  {selectedRcmDraft.missingSections?.includes('activities') &&
                    selectedRcmDraft.activities?.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            Draft Activity / Control-point Sequence
                          </div>
                          <div className="text-[10px] text-amber-700">
                            Sequence belum source-confirmed
                          </div>
                        </div>
                        <div className="space-y-2">
                          {selectedRcmDraft.activities.map((activity: any) => (
                            <div
                              key={activity.activityId}
                              className="rounded-xl border border-slate-200 bg-white p-3"
                            >
                              <div className="flex items-start gap-2">
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-[9px] font-black text-cyan-800">
                                  {activity.orderIndex}
                                </span>
                                <div className="min-w-0">
                                  <div className="text-xs font-black text-slate-900">
                                    {activity.name}
                                  </div>
                                  <div className="mt-1 text-[10px] leading-4 text-slate-500">
                                    {activity.description}
                                  </div>
                                  <div className="mt-1 text-[10px] text-slate-400">
                                    Pelaksana: {activity.performer || 'Perlu divalidasi'} · Sifat:{' '}
                                    {activity.nature} · Frequency: {activity.frequency}
                                    {activity.systemUsed ? ` · System: ${activity.systemUsed}` : ''}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {selectedRcmDraft.missingSections?.includes('sipoc') && selectedRcmDraft.sipoc && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Draft SIPOC
                      </div>
                      <div className="grid grid-cols-1 gap-2 text-[10px] sm:grid-cols-5">
                        {[
                          ['Pemasok', selectedRcmDraft.sipoc.suppliers],
                          ['Input', selectedRcmDraft.sipoc.inputs],
                          ['Proses', selectedRcmDraft.sipoc.processSteps],
                          ['Output', selectedRcmDraft.sipoc.outputs],
                          ['Pelanggan', selectedRcmDraft.sipoc.customers]
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-xl border border-slate-200 bg-white p-2.5">
                            <div className="font-black uppercase text-slate-400">{label}</div>
                            <div className="mt-1 break-words leading-4 text-slate-700">{value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-800">
                    <strong>Gerbang validasi:</strong> Draf ini tidak dipakai sebagai BPM operasional sebelum
                    user melakukan Validate &amp; Apply. Setelah diterapkan, perubahan RCM berikutnya tetap harus
                    direview karena dapat membuat draft sebelumnya tidak lagi relevan.
                  </div>

                  {draftApplyError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                      {draftApplyError}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-[10px] leading-4 text-slate-500">
                      Bagian yang belum lengkap: {selectedRcmDraft.missingSections?.join(', ')}
                    </div>
                    <button
                      type="button"
                      disabled={draftApplying}
                      onClick={handleApplyRcmDraft}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{draftApplying ? 'Menerapkan draf tervalidasi…' : 'Validasi & Terapkan Draf'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Objectives & Strategic KPIs (Section 22) */}
              {selectedProcess.objectives?.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                    <Target className="w-3.5 h-3.5 text-brand-600" />
                    <span>Tujuan Proses & Metrik Target</span>
                  </h3>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                    <div>
                      <span className="text-slate-500 font-medium">Tujuan Utama:</span>
                      <p className="text-slate-800 font-semibold mt-0.5">
                        {selectedProcess.objectives[0].objective}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200 text-[11px]">
                      <div>
                        <span className="text-slate-400 font-medium">Target KPI:</span>
                        <div className="font-bold text-slate-700">
                          {selectedProcess.objectives[0].kpi || 'Belum tersedia'}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Indikator Risiko Utama (KRI):</span>
                        <div className="font-bold text-rose-700">
                          {selectedProcess.objectives[0].kri || 'Belum tersedia'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SIPOC Builder (Section 24) */}
              {selectedProcess.sipoc && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    SIPOC Model (Section 24)
                  </h3>
                  <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-5">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Pemasok</div>
                      <div className="text-[11px] font-medium text-slate-800 mt-1">{selectedProcess.sipoc.suppliers}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Input</div>
                      <div className="text-[11px] font-medium text-slate-800 mt-1">{selectedProcess.sipoc.inputs}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-brand-50 border border-brand-200">
                      <div className="text-[10px] font-bold text-brand-700 uppercase">Proses</div>
                      <div className="text-[11px] font-medium text-brand-900 mt-1">{selectedProcess.sipoc.processSteps}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Output</div>
                      <div className="text-[11px] font-medium text-slate-800 mt-1">{selectedProcess.sipoc.outputs}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Pelanggan</div>
                      <div className="text-[11px] font-medium text-slate-800 mt-1">{selectedProcess.sipoc.customers}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Saved AI Process Flow */}
              <ProcessFlowDiagramPanel process={selectedProcess} />

              {/* Register Aktivitas (Section 26) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Register Aktivitas ({selectedProcess.activities?.length || 0} Steps)
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">Data Kompatibel BPMN</span>
                </div>

                <div className="space-y-2">
                  {selectedProcess.activities?.map((act: any) => (
                    <div
                      key={act.id}
                      className="flex flex-col items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs hover:bg-slate-50 sm:flex-row sm:items-center"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center">
                          {act.orderIndex}
                        </span>
                        <div>
                          <div className="font-bold text-slate-900">{act.name}</div>
                          <div className="text-[11px] text-slate-500">
                            Performer: {act.performer} • System: {act.systemUsed}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          act.nature === 'Automated'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {act.nature}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-xs">
              Select a process from the register to inspect its 360° profile.
            </div>
          )}
        </div>
      </div>

      {/* Register New Process Modal */}
      {newProcessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl space-y-4 animate-in zoom-in-95 duration-100 sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900">
                {editingProcess ? 'Perbarui Proses Bisnis' : 'Daftarkan Proses Bisnis'}
              </h3>
              <button
                onClick={closeProcessModal}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              {saveError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700">
                  {saveError}
                </div>
              )}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Nama Proses *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Treasury Cash Concentration"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">ID Proses</label>
                  <input
                    type="text"
                    placeholder="PRC-TREAS-002"
                    value={formData.processId}
                    onChange={e => setFormData({ ...formData, processId: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Kategori *</label>
                  <select
                    value={formData.categoryId}
                    onChange={e => setFormData({ ...formData, categoryId: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Pemilik Proses</label>
                  <input
                    type="text"
                    placeholder="Kosongkan jika sumber/pemilik belum terkonfirmasi"
                    value={formData.ownerName}
                    onChange={e => setFormData({ ...formData, ownerName: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Criticality</label>
                  <select
                    value={formData.criticality}
                    onChange={e => setFormData({ ...formData, criticality: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="Not Assessed">Not Assessed</option>
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Classification</label>
                  <select
                    value={formData.classification}
                    onChange={e => setFormData({ ...formData, classification: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="Core">Core</option>
                    <option value="Finance">Finance</option>
                    <option value="Technology">Technology</option>
                    <option value="Governance">Governance</option>
                    <option value="Support">Support</option>
                    <option value="Management">Management</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 cursor-pointer sm:mt-5">
                  <input
                    type="checkbox"
                    checked={formData.isIcofrRelevant}
                    onChange={e => setFormData({ ...formData, isIcofrRelevant: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="font-semibold text-slate-700">ICOFR Relevant</span>
                </label>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Deskripsi</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ringkas tujuan, batasan, dan ruang lingkup proses..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              {editingProcess?.id ? (
                <ProcessSupportingDocumentAI
                  process={editingProcess}
                  onUseSuggestions={draft => {
                    const master = draft?.master || {};
                    setFormData(current => ({
                      ...current,
                      name: master.name || current.name,
                      ownerName: master.ownerName || current.ownerName,
                      criticality: master.criticality || current.criticality,
                      classification: master.classification || current.classification,
                      isIcofrRelevant:
                        typeof master.isIcofrRelevant === 'boolean'
                          ? master.isIcofrRelevant
                          : current.isIcofrRelevant,
                      description: master.description || current.description
                    }));
                  }}
                  onApplied={async () => {
                    await loadProcesses(String(editingProcess.id));
                    setNewProcessModal(false);
                    setEditingProcess(null);
                  }}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/50 p-3 text-[9px] leading-4 text-slate-500">
                  <strong className="text-slate-700">Dokumen Pendukung & ARC AI:</strong>{' '}
                  simpan Process Master terlebih dahulu. Setelah ID Proses terbentuk, buka kembali
                  Update Business Process untuk upload SOP/PDF/DOCX/PPTX/JPEG/XLSX dan membuat draft
                  BPM beserta flowchart.
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={closeProcessModal}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Menyimpan…' : editingProcess ? 'Perbarui Master Proses' : 'Simpan Master Proses'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-xl bg-rose-50 p-2 text-rose-700">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Hapus Proses Bisnis?</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {deleteTarget.processId} — {deleteTarget.name}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
              Deletion is permanent. Total ARC will block deletion when this BP is already referenced by
              risk, control, assurance, or ICOFR scoping records.
            </div>

            {deleteError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError('');
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleting ? 'Menghapus…' : 'Hapus BP'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Process Analysis Drawer */}
      <AIChatDrawer isOpen={aiDrawerOpen} onClose={() => setAiDrawerOpen(false)} />
    </div>
  );
}
