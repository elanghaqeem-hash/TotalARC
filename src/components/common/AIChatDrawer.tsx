'use client';

import React, { useState } from 'react';
import { AlertCircle, Sparkles, X } from 'lucide-react';

export function AIChatDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [message, setMessage] = useState('AI analysis is disabled until an approved provider is configured.');
  const [checking, setChecking] = useState(false);

  if (!isOpen) return null;

  const checkProvider = async () => {
    setChecking(true);
    try {
      const response = await fetch('/api/ai/analyze', { method: 'POST' });
      const data = await response.json();
      setMessage(data.error || data.disclaimer || 'AI provider status received.');
    } catch {
      setMessage('AI analysis is unavailable.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
      <div className="w-full max-w-md h-full bg-white shadow-2xl">
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            <div><div className="font-bold">Total ARC AI Assistant</div><div className="text-[10px] text-slate-300">Persisted-context analysis only</div></div>
          </div>
          <button onClick={onClose} className="p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 flex gap-3 text-amber-900">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <div className="font-bold text-sm">No synthetic findings</div>
              <p className="text-xs mt-1 leading-relaxed">{message}</p>
            </div>
          </div>
          <button onClick={checkProvider} disabled={checking} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-xs font-bold disabled:opacity-50">
            {checking ? 'Checking…' : 'Check AI provider'}
          </button>
        </div>
      </div>
    </div>
  );
}
