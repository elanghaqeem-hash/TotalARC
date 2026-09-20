'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

export function RegisterPager({
  pagination,
  loading = false,
  onPageChange
}: {
  pagination: PaginationMeta;
  loading?: boolean;
  onPageChange: (page: number) => void;
}) {
  const start = pagination.total === 0
    ? 0
    : (pagination.page - 1) * pagination.pageSize + 1;
  const end = Math.min(
    pagination.page * pagination.pageSize,
    pagination.total
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
      <span>
        Showing <strong className="text-slate-800">{start}-{end}</strong> of{' '}
        <strong className="text-slate-800">{pagination.total}</strong> records
      </span>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={loading || !pagination.hasPrevious}
          onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Previous
        </button>

        <span className="min-w-[84px] text-center font-semibold text-slate-600">
          Page {pagination.page} / {pagination.totalPages}
        </span>

        <button
          type="button"
          disabled={loading || !pagination.hasNext}
          onClick={() => onPageChange(Math.min(pagination.totalPages, pagination.page + 1))}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export const EMPTY_PAGINATION: PaginationMeta = {
  page: 1,
  pageSize: 50,
  total: 0,
  totalPages: 1,
  hasPrevious: false,
  hasNext: false
};
