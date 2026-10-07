'use client';

import { useEffect, useState } from 'react';
import type { ProcessOwnerUnit } from '@/lib/process-owners';

type Props = {
  value: string[] | undefined;
  legacyName: string;
  disabled?: boolean;
  onChange: (ids: string[]) => void;
};

export function ProcessOwnerPicker({ value, legacyName, disabled, onChange }: Props) {
  const [units, setUnits] = useState<ProcessOwnerUnit[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch('/api/processes?view=owners', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Struktur organisasi gagal dimuat.');
        setUnits(Array.isArray(payload.units) ? payload.units : []);
      })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);
  const selected = value || [];
  const byId = new Map(units.map(unit => [unit.id, unit]));
  const path = (unit: ProcessOwnerUnit) => {
    const names = [unit.name];
    const seen = new Set([unit.id]);
    let parent = unit.parentId ? byId.get(unit.parentId) : undefined;
    while (parent && !seen.has(parent.id)) {
      names.unshift(parent.name);
      seen.add(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return names.join(' › ');
  };
  const visible = units.filter(unit => `${unit.code} ${unit.type} ${path(unit)}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <fieldset disabled={disabled} className="min-w-0 rounded-lg border border-slate-200 p-2.5">
      <legend className="px-1 font-bold text-slate-700">Pemilik Proses</legend>
      <p className="mb-2 text-xs text-slate-500">Pilih satu atau beberapa unit dari struktur organisasi.</p>
      {value === undefined && legacyName && <p className="mb-2 break-words text-xs text-amber-700">Pemilik sebelumnya: {legacyName}. Pilih unit untuk memperbarui.</p>}
      <div className="mb-2 flex flex-wrap gap-1">
        {selected.map(id => <button key={id} type="button" onClick={() => onChange(selected.filter(item => item !== id))}
          className="max-w-full break-words rounded-md bg-sky-50 px-2 py-1 text-left text-xs text-sky-800"
          aria-label={`Hapus pemilik ${byId.get(id)?.name || id}`}>
          {byId.get(id)?.name || (loading ? 'Memuat unit…' : 'Unit tidak aktif / tidak tersedia')} ×
        </button>)}
      </div>
      <input aria-label="Cari unit pemilik proses" placeholder="Cari nama, kode, atau induk unit…" value={search} onChange={event => setSearch(event.target.value)}
        className="mb-2 w-full min-w-0 rounded-md border border-slate-200 p-2 text-sm" />
      {loading ? <p role="status" className="text-xs">Memuat struktur organisasi…</p> : error ?
        <div role="alert" className="text-xs text-red-700">{error} <button type="button" onClick={() => setRetry(current => current + 1)} className="underline">Coba lagi</button></div> :
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {visible.map(unit => <label key={unit.id} className="flex cursor-pointer items-start gap-2 rounded p-2 hover:bg-slate-50">
            <input type="checkbox" checked={selected.includes(unit.id)} className="mt-1"
              onChange={event => onChange(event.target.checked ? [...selected, unit.id] : selected.filter(id => id !== unit.id))} />
            <span className="min-w-0 break-words text-xs"><strong>{unit.code} — {unit.name}</strong><span className="block text-slate-500">{unit.type} · {path(unit)}</span></span>
          </label>)}
          {!visible.length && <p className="text-xs text-slate-500">{units.length ? 'Tidak ada unit yang cocok.' : 'Belum ada unit aktif. Lengkapi Struktur Organisasi terlebih dahulu.'}</p>}
        </div>}
      <p className="mt-2 text-xs text-slate-500">{selected.length} unit dipilih</p>
    </fieldset>
  );
}
