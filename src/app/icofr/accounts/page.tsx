'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Pencil,
  Plus,
  Save
} from 'lucide-react';
import { SignificantAccountAI } from '@/components/icofr/SignificantAccountAI';

type Item = {
  id: string;
  recordType: 'Account' | 'Disclosure';
  itemCode: string;
  name: string;
  financialStatement?: string | null;
  balanceAmount?: number | null;
  currency?: string | null;
  significant: boolean;
  scopingRationale?: string | null;
  assertions?: string | null;
  riskFactors?: string | null;
  processReference?: string | null;
  owner?: string | null;
  status: string;
};

const blank = {
  id: '',
  recordType: 'Account',
  itemCode: '',
  name: '',
  financialStatement: '',
  balanceAmount: '',
  currency: '',
  significant: false,
  scopingRationale: '',
  assertions: '',
  riskFactors: '',
  processReference: '',
  owner: '',
  status: 'Draft'
};

function formatAmount(value: number | null | undefined, currency?: string | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return (
    new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value) +
    (currency ? ' ' + currency : '')
  );
}

export default function Page() {
  const [records, setRecords] = useState<Item[]>([]);
  const [institution, setInstitution] = useState<any>(null);
  const [form, setForm] = useState<any>(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadRecords = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/icofr/financial-items', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Register akun dan disclosure tidak tersedia.');
      }
      setRecords(payload.records || []);
      setInstitution(payload.institution || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Register akun dan disclosure tidak tersedia.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
  }, []);

  const stats = useMemo(
    () => ({
      accounts: records.filter(item => item.recordType === 'Account').length,
      disclosures: records.filter(item => item.recordType === 'Disclosure').length,
      significant: records.filter(item => item.significant).length
    }),
    [records]
  );

  const reset = () => {
    setForm(blank);
    setError('');
    setMessage('');
  };

  const edit = (item: Item) => {
    setForm({
      ...blank,
      ...item,
      balanceAmount: item.balanceAmount ?? ''
    });
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/icofr/financial-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Gagal menyimpan akun/disclosure.');

      setRecords(current =>
        current.some(item => item.id === payload.id)
          ? current.map(item => (item.id === payload.id ? payload : item))
          : [...current, payload].sort((a, b) => a.itemCode.localeCompare(b.itemCode))
      );
      setForm((current: any) => ({ ...current, id: payload.id }));
      setMessage(form.id ? 'Data berhasil diperbarui.' : 'Data berhasil disimpan.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan akun/disclosure.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-sky-600">
              <FileSpreadsheet className="h-4 w-4" />
              ICOFR · Penetapan Ruang Lingkup Laporan Keuangan
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">
              Akun Signifikan, Disclosure & Asersi
            </h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              Identifikasi akun dan disclosure material, dokumentasikan dasar signifikansi,
              asersi yang relevan, faktor risiko pelaporan keuangan, serta kepemilikan proses.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-[10px] font-bold">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
              Akun {stats.accounts}
            </span>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">
              Disclosure {stats.disclosures}
            </span>
            <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700">
              Signifikan {stats.significant}
            </span>
          </div>
        </div>
      </div>

      <SignificantAccountAI onApplied={loadRecords} />

      {error && (
        <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {message && (
        <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {message}
        </div>
      )}

      {!loading && !institution ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">
          Daftarkan institusi terlebih dahulu sebelum mengelola akun dan disclosure ICOFR.
        </div>
      ) : (
        <form
          onSubmit={save}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900">
                {form.id ? 'Perbarui akun/disclosure' : 'Input akun/disclosure secara manual'}
              </h2>
              <p className="text-[10px] text-slate-500">
                Form manual tetap tersedia untuk penyesuaian setelah hasil AI divalidasi.
              </p>
            </div>
            {form.id && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-bold"
              >
                <Plus className="h-3 w-3" />
                Baru
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-xs font-bold text-slate-700">
              Jenis data *
              <select
                required
                value={form.recordType}
                onChange={event => setForm({ ...form, recordType: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
              >
                <option value="Account">Akun</option>
                <option value="Disclosure">Disclosure</option>
              </select>
            </label>

            <label className="text-xs font-bold text-slate-700">
              Kode *
              <input
                required
                value={form.itemCode}
                onChange={event => setForm({ ...form, itemCode: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
              />
            </label>

            <label className="text-xs font-bold text-slate-700">
              Nama akun / disclosure *
              <input
                required
                value={form.name}
                onChange={event => setForm({ ...form, name: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
              />
            </label>

            <label className="text-xs font-bold text-slate-700">
              Laporan keuangan / catatan
              <select
                value={form.financialStatement}
                onChange={event => setForm({ ...form, financialStatement: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
              >
                <option value="">Pilih</option>
                <option value="Statement of Financial Position">Laporan Posisi Keuangan</option>
                <option value="Income Statement">Laporan Laba Rugi</option>
                <option value="Cash Flow">Laporan Arus Kas</option>
                <option value="Statement of Changes in Equity">Laporan Perubahan Ekuitas</option>
                <option value="Notes / Disclosure">Catatan / Disclosure</option>
                <option value="Regulatory Reporting">Pelaporan Regulator</option>
              </select>
            </label>

            <label className="text-xs font-bold text-slate-700">
              Nilai saldo / eksposur
              <input
                type="number"
                step="any"
                value={form.balanceAmount}
                onChange={event => setForm({ ...form, balanceAmount: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
              />
            </label>

            <label className="text-xs font-bold text-slate-700">
              Mata uang
              <input
                maxLength={3}
                value={form.currency}
                onChange={event =>
                  setForm({ ...form, currency: event.target.value.toUpperCase() })
                }
                placeholder="IDR"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal uppercase"
              />
            </label>

            <label className="text-xs font-bold text-slate-700 md:col-span-2">
              Asersi relevan
              <input
                value={form.assertions}
                onChange={event => setForm({ ...form, assertions: event.target.value })}
                placeholder="Eksistensi, Kelengkapan, Akurasi, Valuasi, Hak & Kewajiban, Cut-off, Penyajian & Pengungkapan"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
              />
            </label>

            <label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={form.significant}
                onChange={event => setForm({ ...form, significant: event.target.checked })}
              />
              Signifikan / masuk ruang lingkup
            </label>

            <label className="text-xs font-bold text-slate-700 md:col-span-2 xl:col-span-3">
              Dasar penetapan ruang lingkup
              <textarea
                rows={2}
                value={form.scopingRationale}
                onChange={event => setForm({ ...form, scopingRationale: event.target.value })}
                placeholder="Dasar kuantitatif dan kualitatif untuk memasukkan atau mengecualikan akun."
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
              />
            </label>

            <label className="text-xs font-bold text-slate-700 md:col-span-2 xl:col-span-3">
              Faktor risiko pelaporan keuangan
              <textarea
                rows={2}
                value={form.riskFactors}
                onChange={event => setForm({ ...form, riskFactors: event.target.value })}
                placeholder="Fraud, estimasi, kompleksitas, pihak berelasi, transaksi tidak biasa, judgement, volatilitas, sensitivitas regulasi, dan lain-lain."
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
              />
            </label>

            <label className="text-xs font-bold text-slate-700">
              Referensi proses / siklus
              <input
                value={form.processReference}
                onChange={event => setForm({ ...form, processReference: event.target.value })}
                placeholder="Contoh: Revenue-to-Cash"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
              />
            </label>

            <label className="text-xs font-bold text-slate-700">
              Pemilik
              <input
                value={form.owner}
                onChange={event => setForm({ ...form, owner: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
              />
            </label>

            <label className="text-xs font-bold text-slate-700">
              Status
              <select
                value={form.status}
                onChange={event => setForm({ ...form, status: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
              >
                <option value="Draft">Draf</option>
                <option value="Under Review">Dalam Review</option>
                <option value="Approved">Disetujui</option>
                <option value="Out of Scope">Di Luar Ruang Lingkup</option>
              </select>
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Menyimpan…' : form.id ? 'Perbarui Data' : 'Simpan Data'}
            </button>
          </div>
        </form>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-black text-slate-900">
          Register akun & disclosure
        </h2>

        {loading ? (
          <div className="py-8 text-center text-xs text-slate-500">Memuat…</div>
        ) : records.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
            Belum ada akun atau disclosure yang terdaftar.
          </div>
        ) : (
          <div className="space-y-2">
            {records.map(item => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] font-black text-brand-700">
                        {item.itemCode}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold">
                        {item.recordType === 'Account' ? 'Akun' : 'Disclosure'}
                      </span>
                      {item.significant && (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-bold text-sky-700">
                          Signifikan
                        </span>
                      )}
                    </div>

                    <div className="mt-1 text-sm font-bold text-slate-900">{item.name}</div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {[
                        item.financialStatement,
                        formatAmount(item.balanceAmount, item.currency),
                        item.assertions,
                        item.status === 'Draft'
                          ? 'Draf'
                          : item.status === 'Under Review'
                            ? 'Dalam Review'
                            : item.status === 'Approved'
                              ? 'Disetujui'
                              : item.status
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>

                    {item.scopingRationale && (
                      <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-slate-500">
                        {item.scopingRationale}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => edit(item)}
                    className="rounded-lg border border-slate-200 p-2 text-slate-500"
                    aria-label={'Perbarui ' + item.name}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
