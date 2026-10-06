'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Cloud,
  Cpu,
  KeyRound,
  RefreshCw,
  Save,
  Route,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Trash2
} from 'lucide-react';

type ProviderName = 'cloudflare' | 'openai' | 'gemini' | 'groq' | 'openrouter';
type AiLevel = 'FAST' | 'STANDARD' | 'ADVANCED';

type ProviderForm = {
  provider: ProviderName;
  enabled: boolean;
  model: string;
  aiLevel: AiLevel;
  priority: number;
  allowSensitive: boolean;
  features: string[];
  apiKey: string;
};

const providerTone: Record<ProviderName, string> = {
  openai: 'border-teal-200 bg-teal-50/40',
  cloudflare: 'border-orange-200 bg-orange-50/40',
  gemini: 'border-sky-200 bg-sky-50/40',
  groq: 'border-violet-200 bg-violet-50/40',
  openrouter: 'border-emerald-200 bg-emerald-50/40'
};

const providerVisual: Record<
  ProviderName,
  {
    Icon: React.ComponentType<{ className?: string }>;
    iconClassName: string;
  }
> = {
  openai: {
    Icon: Sparkles,
    iconClassName: 'bg-emerald-50 text-emerald-600 ring-emerald-100'
  },
  cloudflare: {
    Icon: Cloud,
    iconClassName: 'bg-orange-50 text-orange-500 ring-orange-100'
  },
  gemini: {
    Icon: Sparkles,
    iconClassName: 'bg-sky-50 text-sky-600 ring-sky-100'
  },
  groq: {
    Icon: Cpu,
    iconClassName: 'bg-violet-50 text-violet-600 ring-violet-100'
  },
  openrouter: {
    Icon: Route,
    iconClassName: 'bg-slate-100 text-slate-700 ring-slate-200'
  }
};

export default function AiSettingsPage() {
  const [data, setData] = useState<any>(null);
  const [forms, setForms] = useState<Record<string, ProviderForm>>({});
  const [providerOrder, setProviderOrder] = useState<ProviderName[]>(['openai', 'cloudflare', 'gemini', 'groq', 'openrouter']);
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/ai-settings', {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Konfigurasi AI tidak tersedia.');
      setData(payload);
      setProviderOrder(payload.providerOrder || []);

      const next: Record<string, ProviderForm> = {};
      for (const item of payload.providers || []) {
        const config = item.config;
        next[item.provider] = {
          provider: item.provider,
          enabled: config?.enabled ?? false,
          model: config?.model || item.model,
          aiLevel: config?.aiLevel || 'STANDARD',
          priority: config?.priority || 50,
          allowSensitive: item.provider === 'cloudflare' ? true : Boolean(config?.allowSensitive),
          features: config?.features || [],
          apiKey: ''
        };
      }
      setForms(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Konfigurasi AI tidak tersedia.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updateForm = (provider: ProviderName, patch: Partial<ProviderForm>) => {
    setForms(current => ({ ...current, [provider]: { ...current[provider], ...patch } }));
  };

  const toggleFeature = (provider: ProviderName, featureId: string) => {
    const current = forms[provider]?.features || [];
    updateForm(provider, {
      features: current.includes(featureId)
        ? current.filter(item => item !== featureId)
        : [...current, featureId]
    });
  };

  const request = async (provider: ProviderName, action: 'SAVE' | 'TEST' | 'DELETE') => {
    const form = forms[provider];
    if (!form) return;
    if (action === 'DELETE' && !window.confirm('Hapus konfigurasi provider ini? API key terenkripsi juga akan dihapus.')) return;

    setBusyProvider(provider + ':' + action.toLowerCase());
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/ai-settings', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'SAVE'
            ? { action, ...form, apiKey: form.apiKey || undefined }
            : { action, provider }
        )
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || payload?.error || 'Aksi konfigurasi AI gagal.');
      setMessage(
        payload.message ||
          (action === 'TEST'
            ? 'Koneksi provider AI berhasil.'
            : action === 'DELETE'
              ? 'Konfigurasi provider berhasil dihapus.'
              : 'Konfigurasi AI berhasil disimpan.')
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aksi konfigurasi AI gagal.');
      if (action === 'TEST') await load();
    } finally {
      setBusyProvider('');
    }
  };

  const moveProvider = (index: number, direction: number) => {
    setProviderOrder(current => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const saveOrder = async () => {
    setBusyProvider('order');
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/ai-settings', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REORDER', order: providerOrder })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Urutan AI gagal disimpan.');
      setMessage(payload.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Urutan AI gagal disimpan.');
    } finally { setBusyProvider(''); }
  };

  const configuredCount = useMemo(
    () => (data?.providers || []).filter((item: any) => item.config?.enabled).length,
    [data]
  );
  const healthyCount = useMemo(
    () =>
      (data?.providers || []).filter(
        (item: any) => item.config?.enabled && item.config?.lastTestStatus === 'PASS'
      ).length,
    [data]
  );

  return (
    <div className="space-y-5">
      {data && (
        <section
          id="urutan-provider"
          className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/70 shadow-sm"
        >
          <div className="border-b border-slate-200 bg-white px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-3xl">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-brand-600">
                  <Cpu className="h-4 w-4" />
                  Routing AI Total ARC
                </div>
                <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
                  Urutan Penggunaan AI
                </h2>
                <p className="mt-2 text-xs leading-5 text-slate-500 sm:text-sm">
                  Provider pada posisi paling atas menjadi pilihan utama. Jika tidak tersedia,
                  Total ARC otomatis melanjutkan ke provider aktif berikutnya sesuai izin fitur
                  dan klasifikasi data.
                </p>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-black text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Fallback otomatis aktif
              </div>
            </div>
          </div>

          <ol className="space-y-3 p-3 sm:p-5">
            {providerOrder.map((provider, index) => {
              const item = data.providers.find((candidate: any) => candidate.provider === provider);
              const visual = providerVisual[provider];
              const ProviderIcon = visual.Icon;
              const isFirst = index === 0;
              const isLast = index === providerOrder.length - 1;

              return (
                <li
                  key={provider}
                  className="group grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:shadow-sm sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:gap-4 sm:p-4"
                >
                  <div
                    className={
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black ring-1 sm:h-11 sm:w-11 ' +
                      (isFirst
                        ? 'bg-brand-50 text-brand-700 ring-brand-100'
                        : 'bg-slate-50 text-slate-700 ring-slate-200')
                    }
                    aria-label={'Prioritas ' + (index + 1)}
                  >
                    {index + 1}
                  </div>

                  <div
                    className={
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 sm:h-12 sm:w-12 ' +
                      visual.iconClassName
                    }
                    aria-hidden="true"
                  >
                    <ProviderIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-black text-slate-950 sm:text-base">
                        {item?.label || provider}
                      </span>
                      {isFirst ? (
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-brand-700">
                          Utama
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-slate-500">
                          Fallback {index}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[10px] leading-4 text-slate-400">
                      {item?.config?.enabled
                        ? 'Aktif dan siap mengikuti urutan routing.'
                        : 'Urutan tersimpan; provider hanya digunakan jika diaktifkan.'}
                    </div>
                  </div>

                  <div className="col-span-3 grid grid-cols-2 gap-2 sm:col-span-1 sm:flex sm:justify-end">
                    <button
                      type="button"
                      disabled={isFirst || !!busyProvider}
                      onClick={() => moveProvider(index, -1)}
                      aria-label={'Naikkan ' + (item?.label || provider)}
                      title={isFirst ? 'Sudah berada di urutan teratas' : 'Naikkan satu tingkat'}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-300 disabled:ring-0 sm:min-w-[104px]"
                    >
                      <ArrowUp className="h-4 w-4" />
                      Naik
                    </button>
                    <button
                      type="button"
                      disabled={isLast || !!busyProvider}
                      onClick={() => moveProvider(index, 1)}
                      aria-label={'Turunkan ' + (item?.label || provider)}
                      title={isLast ? 'Sudah berada di urutan terbawah' : 'Turunkan satu tingkat'}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-700 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-300 disabled:ring-0 sm:min-w-[104px]"
                    >
                      <ArrowDown className="h-4 w-4" />
                      Turun
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="max-w-3xl text-[10px] leading-4 text-slate-500">
              Perubahan urutan tidak mengaktifkan provider dan tidak mengubah API key. Kebijakan
              data sensitif tetap mengikuti konfigurasi masing-masing provider.
            </p>
            <button
              type="button"
              onClick={saveOrder}
              disabled={!!busyProvider}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-xs font-black text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {busyProvider === 'order' ? 'Menyimpan…' : 'Simpan Urutan AI'}
            </button>
          </div>
        </section>
      )}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-4xl">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-brand-600">
              <Sparkles className="h-4 w-4" />
              Administrasi AI Total ARC
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-950">
              Konfigurasi AI, API Key & Peruntukan Tombol
            </h1>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Administrator memilih provider, model, level AI, prioritas fallback, dan halaman mana
              yang boleh menggunakan provider tersebut. API key tidak pernah ditampilkan kembali.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Perbarui
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Provider Aktif', configuredCount, Cpu],
          ['Koneksi Sehat', healthyCount, CheckCircle2],
          ['Fitur AI', data?.features?.length || 0, Sparkles],
          ['Vault API Key', data ? (data.vaultReady ? 'Siap' : 'Belum Siap') : 'Belum terverifikasi', ShieldCheck]
        ].map(([label, value, Icon]: any) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div>
              <Icon className="h-4 w-4 text-slate-400" />
            </div>
            <div className="mt-2 text-xl font-black text-slate-950">{value}</div>
          </div>
        ))}
      </section>

      {data && !data.vaultReady && !loading && (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Vault API key belum siap.</strong> Tambahkan secret server-side
            <code className="mx-1 rounded bg-white px-1.5 py-0.5">AI_CONFIG_MASTER_KEY</code>
            di Cloudflare. Dedicated master key direkomendasikan untuk produksi.
          </div>
        </div>
      )}

      {error && (
        <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {message && (
        <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />{message}
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        {(data?.providers || []).map((item: any) => {
          const provider = item.provider as ProviderName;
          const form = forms[provider];
          if (!form) return null;
          const config = item.config;
          const busy = busyProvider.startsWith(provider + ':');

          return (
            <div key={provider} className={`rounded-2xl border p-5 shadow-sm ${providerTone[provider]}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-black text-slate-950">{item.label}</h2>
                    {config?.lastTestStatus === 'PASS' && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[8px] font-black text-emerald-700">TERHUBUNG</span>
                    )}
                    {config?.lastTestStatus === 'FAIL' && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[8px] font-black text-rose-700">GAGAL</span>
                    )}
                    {!config && item.environmentConfigured && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-black text-slate-600">ENV DEFAULT</span>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-slate-500">{item.description}</p>
                </div>
                <label className="inline-flex shrink-0 items-center gap-2 text-[10px] font-black text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={event => updateForm(provider, { enabled: event.target.checked })}
                    className="h-4 w-4 accent-sky-600"
                  />
                  Aktif
                </label>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {item.requiresApiKey ? (
                  <label className="text-[10px] font-bold text-slate-600 sm:col-span-2">
                    API Key
                    <div className="mt-1 flex items-center gap-2">
                      <div className="relative flex-1">
                        <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="password"
                          autoComplete="off"
                          value={form.apiKey}
                          onChange={event => updateForm(provider, { apiKey: event.target.value })}
                          placeholder={
                            config?.apiKeyConfigured
                              ? 'Kosongkan untuk mempertahankan API key ' + (config.apiKeyHint || '')
                              : 'Masukkan API key provider'
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs font-normal outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                        />
                      </div>
                      {config?.apiKeyConfigured && (
                        <span className="shrink-0 rounded-lg bg-white px-2 py-2 text-[9px] font-black text-slate-500 ring-1 ring-slate-200">
                          {config.apiKeyHint}
                        </span>
                      )}
                    </div>
                  </label>
                ) : (
                  <div className="rounded-xl border border-orange-200 bg-white px-3 py-2.5 text-[10px] leading-4 text-slate-600 sm:col-span-2">
                    Menggunakan <strong>Cloudflare Workers AI binding</strong>; tidak memerlukan API key user.
                  </div>
                )}

                <label className="text-[10px] font-bold text-slate-600">
                  Model
                  <input
                    value={form.model}
                    onChange={event => updateForm(provider, { model: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal"
                  />
                </label>

                <label className="text-[10px] font-bold text-slate-600">
                  Level AI
                  <select
                    value={form.aiLevel}
                    onChange={event => updateForm(provider, { aiLevel: event.target.value as AiLevel })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal"
                  >
                    {(data?.levels || []).map((level: any) => (
                      <option key={level.id} value={level.id}>{level.label} — {level.id}</option>
                    ))}
                  </select>
                </label>

                <label className="text-[10px] font-bold text-slate-600">
                  Prioritas Routing
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={form.priority}
                    onChange={event => updateForm(provider, { priority: Number(event.target.value || 50) })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal"
                  />
                  <span className="mt-1 block text-[8px] font-normal text-slate-400">Angka lebih kecil diprioritaskan.</span>
                </label>

                {provider !== 'cloudflare' && (
                  <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-[9px] leading-4 text-slate-600">
                    <input
                      type="checkbox"
                      checked={form.allowSensitive}
                      onChange={event => updateForm(provider, { allowSensitive: event.target.checked })}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-sky-600"
                    />
                    <span>
                      <strong>Izinkan data confidential/restricted</strong><br />
                      Tetap melalui redaction gateway. Aktifkan hanya jika kebijakan Bank mengizinkan provider eksternal.
                    </span>
                  </label>
                )}
              </div>

              <div className="mt-4">
                <div className="text-[10px] font-black text-slate-700">Peruntukan tombol AI</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(data?.features || []).map((feature: any) => {
                    const checked = form.features.includes(feature.id);
                    return (
                      <label
                        key={feature.id}
                        className={
                          'cursor-pointer rounded-xl border p-2.5 transition ' +
                          (checked
                            ? 'border-sky-300 bg-sky-50 ring-1 ring-sky-100'
                            : 'border-slate-200 bg-white hover:bg-slate-50')
                        }
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFeature(provider, feature.id)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-sky-600"
                          />
                          <div>
                            <div className="text-[9px] font-black text-slate-800">{feature.pageLabel}</div>
                            <div className="mt-0.5 text-[8px] font-bold text-sky-700">{feature.buttonLabel}</div>
                            <div className="mt-1 text-[8px] leading-3.5 text-slate-400">Rekomendasi level: {feature.recommendedLevel}</div>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {config?.lastTestAt && (
                <div className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-[9px] leading-4 text-slate-500">
                  Test terakhir: {new Date(config.lastTestAt).toLocaleString('id-ID')}
                  {config.lastTestMessage ? ' · ' + config.lastTestMessage : ''}
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                {config && (
                  <button
                    type="button"
                    onClick={() => void request(provider, 'DELETE')}
                    disabled={busy}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 text-[9px] font-black text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />Hapus
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void request(provider, 'SAVE')}
                  disabled={busy}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[9px] font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {busyProvider === provider + ':save' ? 'Menyimpan…' : 'Simpan'}
                </button>
                <button
                  type="button"
                  onClick={() => void request(provider, 'TEST')}
                  disabled={busy || !config}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-[9px] font-black text-white hover:bg-slate-800 disabled:opacity-40"
                >
                  <TestTube2 className="h-3.5 w-3.5" />
                  {busyProvider === provider + ':test' ? 'Menguji…' : 'Test Koneksi'}
                </button>
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-brand-600" />
          <div>
            <h2 className="text-sm font-black text-slate-900">Matriks Peruntukan Tombol AI</h2>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Provider utama per tombol AI; provider lain pada fitur yang sama menjadi fallback sesuai prioritas.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[860px] w-full text-[10px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-2.5 text-left">Halaman / Fitur</th>
                <th className="p-2.5 text-left">Tombol AI</th>
                <th className="p-2.5 text-left">Provider Utama</th>
                <th className="p-2.5 text-left">Level AI</th>
                <th className="p-2.5 text-left">Status</th>
                <th className="p-2.5 text-left">Fallback</th>
              </tr>
            </thead>
            <tbody>
              {(data?.featureAssignments || []).map((item: any) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="p-2.5">
                    <div className="font-black text-slate-800">{item.pageLabel}</div>
                    <div className="text-[8px] text-slate-400">{item.page}</div>
                  </td>
                  <td className="p-2.5 font-bold text-sky-700">{item.buttonLabel}</td>
                  <td className="p-2.5">
                    {item.provider ? (
                      <span className="rounded-full bg-slate-100 px-2 py-1 font-black text-slate-700">{item.provider}</span>
                    ) : (
                      <span className="text-slate-400">Gateway default</span>
                    )}
                  </td>
                  <td className="p-2.5">{item.aiLevel || 'Default'}</td>
                  <td className="p-2.5">
                    <span className={
                      'rounded-full px-2 py-1 text-[8px] font-black ' +
                      (item.status === 'PASS'
                        ? 'bg-emerald-50 text-emerald-700'
                        : item.status === 'FAIL'
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-slate-100 text-slate-500')
                    }>
                      {item.status === 'PASS'
                        ? 'TERHUBUNG'
                        : item.status === 'FAIL'
                          ? 'GAGAL'
                          : item.status === 'NOT_TESTED'
                            ? 'BELUM DITEST'
                            : 'DEFAULT'}
                    </span>
                  </td>
                  <td className="p-2.5 text-slate-500">{(item.fallbacks || []).length ? item.fallbacks.join(' → ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
