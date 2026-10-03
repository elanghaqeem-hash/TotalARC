'use client';

import React, { useEffect, useRef } from 'react';
import { normalizeLegacyRichText, sanitizeLimitedRichText } from '@/lib/rich-text';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeightClassName?: string;
};

const tools = [
  { command: 'bold', label: 'B', title: 'Tebal', className: 'font-black' },
  { command: 'italic', label: 'I', title: 'Miring', className: 'italic font-bold' },
  { command: 'underline', label: 'U', title: 'Garis bawah', className: 'underline font-bold' },
  { command: 'insertOrderedList', label: '1.', title: 'Daftar bernomor', className: 'font-black' },
  { command: 'insertUnorderedList', label: '•', title: 'Daftar pointer', className: 'text-base font-black' }
] as const;

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Tulis informasi di sini…',
  disabled = false,
  minHeightClassName = 'min-h-[110px]'
}: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const normalized = normalizeLegacyRichText(value);
    if (editor.innerHTML !== normalized) editor.innerHTML = normalized;
  }, [value]);

  const sync = () => {
    const editor = editorRef.current;
    if (!editor) return;
    onChange(sanitizeLimitedRichText(editor.innerHTML));
  };

  const apply = (command: string) => {
    if (disabled) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false);
    sync();
  };

  return (
    <div className="mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-100">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-slate-50 px-2 py-1.5">
        {tools.map(tool => (
          <button
            key={tool.command}
            type="button"
            title={tool.title}
            aria-label={tool.title}
            disabled={disabled}
            onMouseDown={event => event.preventDefault()}
            onClick={() => apply(tool.command)}
            className={
              'inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40 ' +
              tool.className
            }
          >
            {tool.label}
          </button>
        ))}
        <span className="ml-1 text-[9px] text-slate-400">
          B = tebal · I = miring · U = garis bawah · 1. = nomor · • = pointer
        </span>
      </div>

      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={sync}
        onBlur={sync}
        className={
          `${minHeightClassName} w-full px-3 py-2.5 text-xs font-normal leading-5 text-slate-800 outline-none ` +
          'empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] ' +
          '[&_ol]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_li]:pl-1 ' +
          (disabled ? 'cursor-not-allowed bg-slate-100 text-slate-400' : '')
        }
      />
    </div>
  );
}

export function RichTextDisplay({ value, className = '' }: { value: string | null | undefined; className?: string }) {
  const html = normalizeLegacyRichText(value);
  if (!html) return null;

  return (
    <div
      className={
        `whitespace-normal ${className} ` +
        '[&_ol]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_li]:pl-1'
      }
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
