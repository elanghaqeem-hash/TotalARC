'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Download,
  FileArchive,
  FileCheck,
  FilePlus2,
  Fingerprint,
  Link2,
  RefreshCw,
  Save,
  Trash2,
  Upload
} from 'lucide-react';

const emptyUpload = {
  documentId: '',
  title: '',
  description: '',
  category: 'ICOFR Testing Evidence',
  sensitivity: 'Confidential',
  retentionClass: '7 Years',
  retentionUntil: '',
  legalHold: false,
  ownerName: '',
  sourceSystem: '',
  uploadedBy: '',
  versionNote: '',
  entityType: '',
  entityId: '',
  relationship: 'SUPPORTS',
  linkNotes: '',
  syncWorkpaperIndex: false,
  workpaperEvidenceType: '',
  workpaperEvidenceOwner: ''
};

const emptyGovernance = {
  documentId: '',
  title: '',
  description: '',
  category: '',
  sensitivity: 'Confidential',
  retentionClass: '7 Years',
  retentionUntil: '',
  legalHold: false,
  ownerName: '',
  sourceSystem: ''
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return (value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1) + ' ' + units[index];
}

function tone(value: string) {
  if (['Active', 'Accepted', 'Verified', 'Internal'].includes(value)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (['Restricted', 'Archived'].includes(value)) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  if (['Confidential', 'Pending'].includes(value)) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function EvidenceRepositoryPage() {
  const [data, setData] = useState<any>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [uploadForm, setUploadForm] = useState(emptyUpload);
  const [governanceForm, setGovernanceForm] = useState(emptyGovernance);
  const [linkForm, setLinkForm] = useState({
    entityType: '',
    entityId: '',
    relationship: 'SUPPORTS',
    notes: '',
    syncWorkpaperIndex: false,
    evidenceType: '',
    evidenceOwner: ''
  });
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [verification, setVerification] = useState<any>(null);
  const [filter, setFilter] = useState('Active');

  const load = async (force = false) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/evidence', {
        cache: force ? 'no-store' : 'default'
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Evidence repository unavailable.');
      setData(body);

      const currentId =
        selectedDocumentId && body.documents?.some((item: any) => item.id === selectedDocumentId)
          ? selectedDocumentId
          : body.documents?.[0]?.id || '';
      setSelectedDocumentId(currentId);

      if (currentId) {
        const current = body.documents.find((item: any) => item.id === currentId);
        if (current) {
          setGovernanceForm({
            documentId: current.id,
            title: current.title || '',
            description: current.description || '',
            category: current.category || '',
            sensitivity: current.sensitivity || 'Confidential',
            retentionClass: current.retentionClass || '7 Years',
            retentionUntil: current.retentionUntil || '',
            legalHold: Boolean(current.legalHold),
            ownerName: current.ownerName || '',
            sourceSystem: current.sourceSystem || ''
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evidence repository unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectedDocument = useMemo(
    () => data?.documents?.find((item: any) => item.id === selectedDocumentId) || null,
    [data, selectedDocumentId]
  );

  const filteredDocuments = useMemo(() => {
    return (data?.documents || []).filter((item: any) => {
      if (filter === 'All') return true;
      if (filter === 'Legal Hold') return Boolean(item.legalHold);
      return item.status === filter;
    });
  }, [data, filter]);

  const uploadTargets = useMemo(
    () =>
      (data?.linkTargets || []).filter(
        (item: any) => !uploadForm.entityType || item.entityType === uploadForm.entityType
      ),
    [data, uploadForm.entityType]
  );

  const linkTargets = useMemo(
    () =>
      (data?.linkTargets || []).filter(
        (item: any) => !linkForm.entityType || item.entityType === linkForm.entityType
      ),
    [data, linkForm.entityType]
  );

  const post = async (payload: any, success: string) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Evidence action failed.');
      setMessage(success);
      await load(true);
      return body;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evidence action failed.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError('Select a real evidence file before uploading.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const form = new FormData();
      Object.entries(uploadForm).forEach(([key, value]) => {
        form.append(key, typeof value === 'boolean' ? String(value) : String(value || ''));
      });
      form.append('file', file);

      const response = await fetch('/api/evidence/upload', {
        method: 'POST',
        body: form
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Evidence upload failed.');

      setSelectedDocumentId(body.documentId);
      setMessage(
        body.linkWarning
          ? `Evidence stored as ${body.evidenceId} v${body.versionNo}. File is safe in the repository, but target linking needs attention: ${body.linkWarning}`
          : `Evidence stored as ${body.evidenceId} v${body.versionNo}; SHA-256 ${body.sha256.slice(0, 16)}…`
      );
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setUploadForm(current => ({
        ...emptyUpload,
        documentId: current.documentId ? body.documentId : '',
        title: current.documentId ? current.title : '',
        description: current.documentId ? current.description : '',
        category: current.documentId ? current.category : 'ICOFR Testing Evidence',
        sensitivity: current.documentId ? current.sensitivity : 'Confidential',
        retentionClass: current.documentId ? current.retentionClass : '7 Years',
        ownerName: current.documentId ? current.ownerName : '',
        sourceSystem: current.documentId ? current.sourceSystem : ''
      }));
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evidence upload failed.');
    } finally {
      setSaving(false);
    }
  };

  const openDocument = (item: any) => {
    setSelectedDocumentId(item.id);
    setGovernanceForm({
      documentId: item.id,
      title: item.title || '',
      description: item.description || '',
      category: item.category || '',
      sensitivity: item.sensitivity || 'Confidential',
      retentionClass: item.retentionClass || '7 Years',
      retentionUntil: item.retentionUntil || '',
      legalHold: Boolean(item.legalHold),
      ownerName: item.ownerName || '',
      sourceSystem: item.sourceSystem || ''
    });
    setLinkForm({
      entityType: '',
      entityId: '',
      relationship: 'SUPPORTS',
      notes: '',
      syncWorkpaperIndex: false,
      evidenceType: '',
      evidenceOwner: item.ownerName || ''
    });
    setVerification(null);
  };

  const startNewVersion = (item: any) => {
    setUploadForm({
      ...emptyUpload,
      documentId: item.id,
      title: item.title || '',
      description: item.description || '',
      category: item.category || 'ICOFR Testing Evidence',
      sensitivity: item.sensitivity || 'Confidential',
      retentionClass: item.retentionClass || '7 Years',
      retentionUntil: item.retentionUntil || '',
      legalHold: Boolean(item.legalHold),
      ownerName: item.ownerName || '',
      sourceSystem: item.sourceSystem || '',
      uploadedBy: '',
      versionNote: ''
    });
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    document.getElementById('evidence-upload')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-cyan-700">
              <FileArchive className="h-4 w-4" /> Enterprise Evidence Repository
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">
              File Evidence, Version Control, SHA-256 Integrity & Retention
            </h1>
            <p className="mt-1 max-w-5xl text-xs leading-5 text-slate-500">
              Store actual evidence files, maintain immutable version history, pin evidence versions to assurance records,
              verify file integrity before download, and govern sensitivity, retention and legal hold. File content is persisted
              in institution-scoped Cloudflare D1 chunks in the current deployment.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold">
          <Link href="/icofr/sampling-evidence" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Sampling & Evidence</Link>
          <Link href="/icofr/workpaper-review" className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-violet-700">Workpaper Review</Link>
          <Link href="/tod" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">ToD</Link>
          <Link href="/toe" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">ToE</Link>
          <Link href="/certification" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Certification</Link>
          <Link href="/icofr/reporting" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">PBC / Audit Reliance</Link>
        </div>
      </section>

      {error && (
        <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {message && (
        <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {message}
        </div>
      )}

      {!loading && data?.security?.authenticatedIdentityAvailable === false && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-800">
          <strong>Identity control status:</strong> repository versioning, institution scoping, SHA-256 integrity, audit metadata,
          retention and legal hold are active. The current Total ARC role switcher is not authentication, so this module does not
          present role labels as authoritative access control. Identity-backed RBAC must be implemented before production-sensitive
          download authorization can be claimed.
        </div>
      )}

      {!loading && !data?.institution ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">
          Register an institution before storing evidence.
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {[
              ['Documents', data?.metrics?.documents || 0],
              ['Active', data?.metrics?.active || 0],
              ['Versions', data?.metrics?.versions || 0],
              ['Linked', data?.metrics?.linkedDocuments || 0],
              ['Legal hold', data?.metrics?.legalHold || 0],
              ['Retention due', data?.metrics?.retentionDue || 0],
              ['Archived', data?.metrics?.archived || 0],
              ['Stored bytes', formatBytes(Number(data?.metrics?.totalBytes || 0))]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="text-[8px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                <div className="mt-1 text-lg font-black text-slate-900">{value}</div>
              </div>
            ))}
          </section>

          <form
            id="evidence-upload"
            onSubmit={upload}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-brand-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">
                    {uploadForm.documentId ? 'Upload New Version' : '1. Register & Upload Evidence'}
                  </h2>
                  <p className="text-[10px] text-slate-500">
                    Actual file bytes are stored; duplicate current versions are blocked by SHA-256.
                  </p>
                </div>
              </div>
              {uploadForm.documentId && (
                <button
                  type="button"
                  onClick={() => {
                    setUploadForm(emptyUpload);
                    setFile(null);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                  className="text-[10px] font-bold text-slate-500"
                >
                  Switch to new document
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs font-bold text-slate-700 xl:col-span-2">
                Evidence title *
                <input required value={uploadForm.title} onChange={e => setUploadForm({ ...uploadForm, title: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Category *
                <input required value={uploadForm.category} onChange={e => setUploadForm({ ...uploadForm, category: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Sensitivity *
                <select value={uploadForm.sensitivity} onChange={e => setUploadForm({ ...uploadForm, sensitivity: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  {(data?.sensitivities || []).map((item: string) => <option key={item}>{item}</option>)}
                </select>
              </label>

              <label className="text-xs font-bold text-slate-700 md:col-span-2 xl:col-span-4">
                Description
                <textarea rows={2} value={uploadForm.description} onChange={e => setUploadForm({ ...uploadForm, description: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>

              <label className="text-xs font-bold text-slate-700">
                Evidence owner *
                <input required value={uploadForm.ownerName} onChange={e => setUploadForm({ ...uploadForm, ownerName: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Source system / repository
                <input value={uploadForm.sourceSystem} onChange={e => setUploadForm({ ...uploadForm, sourceSystem: e.target.value })} placeholder="ERP / Core Banking / GRC / shared drive" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Retention class *
                <select value={uploadForm.retentionClass} onChange={e => setUploadForm({ ...uploadForm, retentionClass: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                  {(data?.retentionClasses || []).map((item: string) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">
                Retention until {uploadForm.retentionClass === 'Custom' ? '*' : ''}
                <input type="date" required={uploadForm.retentionClass === 'Custom'} value={uploadForm.retentionUntil} onChange={e => setUploadForm({ ...uploadForm, retentionUntil: e.target.value })} disabled={uploadForm.retentionClass !== 'Custom'} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50" />
              </label>

              <label className="text-xs font-bold text-slate-700">
                Uploaded by *
                <input required value={uploadForm.uploadedBy} onChange={e => setUploadForm({ ...uploadForm, uploadedBy: e.target.value })} placeholder="Actual uploader name" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="text-xs font-bold text-slate-700 xl:col-span-2">
                Version note {uploadForm.documentId ? '*' : ''}
                <input required={Boolean(uploadForm.documentId)} value={uploadForm.versionNote} onChange={e => setUploadForm({ ...uploadForm, versionNote: e.target.value })} placeholder={uploadForm.documentId ? 'What changed and why' : 'Optional for version 1'} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 p-3 text-xs font-bold text-slate-700">
                <input type="checkbox" checked={uploadForm.legalHold} onChange={e => setUploadForm({ ...uploadForm, legalHold: e.target.checked })} />
                Legal hold
              </label>

              <label className="text-xs font-bold text-slate-700 md:col-span-2 xl:col-span-4">
                Evidence file * · max {formatBytes(Number(data?.limits?.maxFileBytes || 0))}
                <input
                  ref={fileRef}
                  type="file"
                  required
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.json,.docx,.xlsx,.pptx"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-normal"
                />
                <span className="mt-1 block text-[9px] font-normal text-slate-400">
                  Allowed: {(data?.limits?.allowedExtensions || []).join(', ')}. Macro-enabled/executable formats are intentionally rejected.
                </span>
              </label>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Optional assurance link on upload</div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs font-bold text-slate-700">
                  Target type
                  <select
                    value={uploadForm.entityType}
                    onChange={e => setUploadForm({ ...uploadForm, entityType: e.target.value, entityId: '' })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"
                  >
                    <option value="">No link now</option>
                    {Array.from(new Set((data?.linkTargets || []).map((item: any) => item.entityType))).map((item: any) => <option key={String(item)}>{String(item)}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700 xl:col-span-2">
                  Target record
                  <select value={uploadForm.entityId} disabled={!uploadForm.entityType} onChange={e => setUploadForm({ ...uploadForm, entityId: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal disabled:bg-slate-100">
                    <option value="">Select target</option>
                    {uploadTargets.map((item: any) => <option key={item.entityType + item.entityId} value={item.entityId}>{item.label}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Relationship
                  <input value={uploadForm.relationship} onChange={e => setUploadForm({ ...uploadForm, relationship: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal" />
                </label>
                {uploadForm.entityType === 'WORKPAPER_REVIEW' && (
                  <>
                    <label className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-[10px] font-bold text-violet-700">
                      <input type="checkbox" checked={uploadForm.syncWorkpaperIndex} onChange={e => setUploadForm({ ...uploadForm, syncWorkpaperIndex: e.target.checked })} />
                      Also create workpaper evidence-index item
                    </label>
                    {uploadForm.syncWorkpaperIndex && (
                      <>
                        <label className="text-xs font-bold text-slate-700">
                          Workpaper evidence type *
                          <input value={uploadForm.workpaperEvidenceType} onChange={e => setUploadForm({ ...uploadForm, workpaperEvidenceType: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal" />
                        </label>
                        <label className="text-xs font-bold text-slate-700">
                          Evidence owner *
                          <input value={uploadForm.workpaperEvidenceOwner || uploadForm.ownerName} onChange={e => setUploadForm({ ...uploadForm, workpaperEvidenceOwner: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal" />
                        </label>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button disabled={saving || !file} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-black text-white disabled:opacity-40">
                <FilePlus2 className="h-4 w-4" /> {saving ? 'Storing…' : uploadForm.documentId ? 'Store New Version' : 'Store Evidence'}
              </button>
            </div>
          </form>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.85fr_1.15fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-black text-slate-900">Evidence Register</h2>
                  <p className="mt-1 text-[10px] text-slate-500">Institution-scoped documents and current versions.</p>
                </div>
                <select value={filter} onChange={e => setFilter(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px]">
                  <option>Active</option>
                  <option>Archived</option>
                  <option>Legal Hold</option>
                  <option>All</option>
                </select>
              </div>

              <div className="mt-4 space-y-2">
                {filteredDocuments.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                    No evidence documents for this filter.
                  </div>
                ) : (
                  filteredDocuments.map((item: any) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openDocument(item)}
                      className={`w-full rounded-xl border p-3 text-left ${selectedDocumentId === item.id ? 'border-cyan-300 bg-cyan-50/40' : 'border-slate-200'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-mono text-[10px] font-black text-cyan-700">{item.evidenceId}</div>
                          <div className="truncate text-xs font-black text-slate-900">{item.title}</div>
                          <div className="mt-1 text-[9px] text-slate-500">
                            v{item.currentVersion?.versionNo || '—'} · {item.currentVersion ? formatBytes(Number(item.currentVersion.sizeBytes || 0)) : 'No file'} · {item.ownerName}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${tone(item.status)}`}>{item.status}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${tone(item.sensitivity)}`}>{item.sensitivity}</span>
                          {item.legalHold && <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[9px] font-bold text-rose-700">LEGAL HOLD</span>}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>

            {selectedDocument ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-mono text-[10px] font-black text-cyan-700">{selectedDocument.evidenceId}</div>
                    <h2 className="text-lg font-black text-slate-900">{selectedDocument.title}</h2>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${tone(selectedDocument.status)}`}>{selectedDocument.status}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${tone(selectedDocument.sensitivity)}`}>{selectedDocument.sensitivity}</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-600">{selectedDocument.retentionClass}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedDocument.status === 'Active' && (
                      <button type="button" onClick={() => startNewVersion(selectedDocument)} className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-[10px] font-bold text-brand-700">
                        <Upload className="h-3.5 w-3.5" /> New version
                      </button>
                    )}
                    {selectedDocument.status === 'Active' && !selectedDocument.legalHold && (
                      <button
                        type="button"
                        onClick={() => {
                          const reason = window.prompt('Documented archive reason') || '';
                          if (reason) void post({ actionType: 'ARCHIVE', documentId: selectedDocument.id, reason }, 'Evidence document archived. Binary versions remain preserved.');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-[10px] font-bold text-rose-600"
                      >
                        <Archive className="h-3.5 w-3.5" /> Archive
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div>
                    <h3 className="text-xs font-black text-slate-800">Version History</h3>
                    <div className="mt-2 space-y-2">
                      {(selectedDocument.versions || []).map((version: any) => (
                        <div key={version.id} className="rounded-xl border border-slate-200 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[11px] font-black text-slate-800">
                                v{version.versionNo} · {version.fileName}
                              </div>
                              <div className="mt-1 text-[9px] text-slate-500">
                                {formatBytes(Number(version.sizeBytes || 0))} · {version.mimeType} · uploaded by {version.uploadedBy}
                              </div>
                              <div className="mt-1 break-all font-mono text-[8px] text-slate-400">SHA-256 {version.sha256}</div>
                              {version.versionNote && <div className="mt-1 text-[9px] text-slate-600">Change note: {version.versionNote}</div>}
                            </div>
                            {version.isCurrent && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[8px] font-black text-emerald-700">CURRENT</span>}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <a href={`/api/evidence/download?versionId=${encodeURIComponent(version.id)}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[9px] font-bold text-slate-600">
                              <Download className="h-3 w-3" /> Download
                            </a>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={async () => {
                                const result = await post({ actionType: 'VERIFY', versionId: version.id }, resultMessage(version));
                                if (result) setVerification(result);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-cyan-200 px-2.5 py-1.5 text-[9px] font-bold text-cyan-700"
                            >
                              <Fingerprint className="h-3 w-3" /> Verify SHA-256
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {verification && verification.documentId === selectedDocument.id && (
                      <div className={`mt-3 rounded-xl border p-3 text-[10px] ${verification.matches ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                        <strong>{verification.matches ? 'Integrity verified.' : 'Integrity mismatch.'}</strong>
                        <div className="mt-1 break-all font-mono text-[8px]">Actual: {verification.actualSha256}</div>
                      </div>
                    )}
                  </div>

                  <form
                    onSubmit={event => {
                      event.preventDefault();
                      void post({ actionType: 'UPDATE_GOVERNANCE', ...governanceForm }, 'Evidence governance metadata updated.');
                    }}
                  >
                    <h3 className="text-xs font-black text-slate-800">Governance Metadata</h3>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="text-[10px] font-bold text-slate-700 sm:col-span-2">Title<input required value={governanceForm.title} onChange={e => setGovernanceForm({ ...governanceForm, title: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-normal" /></label>
                      <label className="text-[10px] font-bold text-slate-700 sm:col-span-2">Description<textarea rows={2} value={governanceForm.description} onChange={e => setGovernanceForm({ ...governanceForm, description: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-normal" /></label>
                      <label className="text-[10px] font-bold text-slate-700">Category<input required value={governanceForm.category} onChange={e => setGovernanceForm({ ...governanceForm, category: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-normal" /></label>
                      <label className="text-[10px] font-bold text-slate-700">Owner<input required value={governanceForm.ownerName} onChange={e => setGovernanceForm({ ...governanceForm, ownerName: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-normal" /></label>
                      <label className="text-[10px] font-bold text-slate-700">Sensitivity<select value={governanceForm.sensitivity} onChange={e => setGovernanceForm({ ...governanceForm, sensitivity: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-normal">{(data?.sensitivities || []).map((item: string) => <option key={item}>{item}</option>)}</select></label>
                      <label className="text-[10px] font-bold text-slate-700">Retention<select value={governanceForm.retentionClass} onChange={e => setGovernanceForm({ ...governanceForm, retentionClass: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-normal">{(data?.retentionClasses || []).map((item: string) => <option key={item}>{item}</option>)}</select></label>
                      <label className="text-[10px] font-bold text-slate-700">Retention until<input type="date" disabled={governanceForm.retentionClass !== 'Custom'} value={governanceForm.retentionUntil} onChange={e => setGovernanceForm({ ...governanceForm, retentionUntil: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-normal disabled:bg-slate-50" /></label>
                      <label className="text-[10px] font-bold text-slate-700">Source system<input value={governanceForm.sourceSystem} onChange={e => setGovernanceForm({ ...governanceForm, sourceSystem: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-normal" /></label>
                      <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-[10px] font-bold text-slate-700 sm:col-span-2">
                        <input type="checkbox" checked={governanceForm.legalHold} onChange={e => setGovernanceForm({ ...governanceForm, legalHold: e.target.checked })} />
                        Legal hold — prevents archive operation
                      </label>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40">
                        <Save className="h-3.5 w-3.5" /> Save governance
                      </button>
                    </div>
                  </form>
                </div>
              </section>
            ) : (
              <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">
                Upload or select an evidence document.
              </section>
            )}
          </div>

          {selectedDocument && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-violet-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900">Assurance Traceability Links</h2>
                  <p className="text-[10px] text-slate-500">
                    Links are version-pinned so later document revisions do not silently change historical workpaper evidence.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <form
                  onSubmit={async event => {
                    event.preventDefault();
                    const result = await post(
                      {
                        actionType: 'LINK',
                        documentId: selectedDocument.id,
                        versionId: selectedDocument.currentVersionId,
                        ...linkForm
                      },
                      'Evidence version linked to assurance record.'
                    );
                    if (result) {
                      setLinkForm({
                        entityType: '',
                        entityId: '',
                        relationship: 'SUPPORTS',
                        notes: '',
                        syncWorkpaperIndex: false,
                        evidenceType: '',
                        evidenceOwner: selectedDocument.ownerName || ''
                      });
                    }
                  }}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                >
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Add link for current version</div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700">
                      Target type *
                      <select required value={linkForm.entityType} onChange={e => setLinkForm({ ...linkForm, entityType: e.target.value, entityId: '' })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal">
                        <option value="">Select type</option>
                        {Array.from(new Set((data?.linkTargets || []).map((item: any) => item.entityType))).map((item: any) => <option key={String(item)}>{String(item)}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Relationship *
                      <input required value={linkForm.relationship} onChange={e => setLinkForm({ ...linkForm, relationship: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal" />
                    </label>
                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Target record *
                      <select required value={linkForm.entityId} disabled={!linkForm.entityType} onChange={e => setLinkForm({ ...linkForm, entityId: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal disabled:bg-slate-100">
                        <option value="">Select target</option>
                        {linkTargets.map((item: any) => <option key={item.entityType + item.entityId} value={item.entityId}>{item.label}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Link notes
                      <textarea rows={2} value={linkForm.notes} onChange={e => setLinkForm({ ...linkForm, notes: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal" />
                    </label>
                    {linkForm.entityType === 'WORKPAPER_REVIEW' && (
                      <>
                        <label className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-[10px] font-bold text-violet-700 sm:col-span-2">
                          <input type="checkbox" checked={linkForm.syncWorkpaperIndex} onChange={e => setLinkForm({ ...linkForm, syncWorkpaperIndex: e.target.checked })} />
                          Create workpaper evidence-index item from this repository version
                        </label>
                        {linkForm.syncWorkpaperIndex && (
                          <>
                            <label className="text-xs font-bold text-slate-700">Evidence type *<input value={linkForm.evidenceType} onChange={e => setLinkForm({ ...linkForm, evidenceType: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal" /></label>
                            <label className="text-xs font-bold text-slate-700">Evidence owner *<input value={linkForm.evidenceOwner} onChange={e => setLinkForm({ ...linkForm, evidenceOwner: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal" /></label>
                          </>
                        )}
                      </>
                    )}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button disabled={saving || !linkForm.entityId} className="rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">
                      Link evidence
                    </button>
                  </div>
                </form>

                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Persisted links</div>
                  <div className="mt-3 space-y-2">
                    {(selectedDocument.links || []).length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                        This evidence is not yet linked to an assurance record.
                      </div>
                    ) : (
                      (selectedDocument.links || []).map((item: any) => {
                        const version = selectedDocument.versions?.find((v: any) => v.id === item.versionId);
                        const target = data?.linkTargets?.find((targetItem: any) => targetItem.entityType === item.entityType && targetItem.entityId === item.entityId);
                        return (
                          <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-[10px] font-black text-slate-800">
                                  {item.entityType} · {item.relationship}
                                </div>
                                <div className="mt-1 text-[9px] text-slate-500">
                                  {target?.label || item.entityId} · pinned to v{version?.versionNo || '—'}
                                </div>
                                {item.notes && <div className="mt-1 text-[9px] text-slate-600">{item.notes}</div>}
                              </div>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => window.confirm('Remove this evidence traceability link? The file and version remain preserved.') && void post({ actionType: 'UNLINK', id: item.id }, 'Evidence link removed; document and version preserved.')}
                                className="rounded-lg border border-rose-200 p-1.5 text-rose-600 disabled:opacity-40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

        </>
      )}
    </div>
  );
}

function resultMessage(version: any) {
  return `SHA-256 verification completed for ${version.fileName} v${version.versionNo}.`;
}
