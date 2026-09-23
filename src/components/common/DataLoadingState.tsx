type DataLoadingStateProps = {
  label: string;
  variant?: 'list' | 'profile' | 'panel';
  rows?: number;
  className?: string;
};

export function DataLoadingState({
  label,
  variant = 'list',
  rows = 3,
  className = ''
}: DataLoadingStateProps) {
  const rowCount = Math.max(1, Math.min(rows, 6));

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      <div
        className={`flex items-center gap-3 px-4 text-slate-600 sm:px-5 ${
          variant === 'profile' ? 'justify-center pt-7' : 'pt-4'
        }`}
      >
        <span
          aria-hidden="true"
          className="h-7 w-7 shrink-0 animate-spin rounded-full border-[3px] border-slate-200 border-t-brand-600"
        />
        <span className="text-xs font-bold sm:text-sm">{label}</span>
      </div>

      {variant === 'list' && (
        <div className="space-y-0 px-4 pb-4 pt-3 sm:px-5">
          {Array.from({ length: rowCount }).map((_, index) => (
            <div
              key={index}
              className="flex animate-pulse items-center gap-3 border-t border-slate-100 py-3 first:border-t-0"
              aria-hidden="true"
            >
              <div className="h-12 w-12 shrink-0 rounded-xl bg-slate-100" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3 w-4/5 rounded-full bg-slate-100" />
                <div className="h-2.5 w-3/5 rounded-full bg-slate-100" />
              </div>
              <div className="h-7 w-16 shrink-0 rounded-lg bg-slate-100" />
            </div>
          ))}
        </div>
      )}

      {variant === 'profile' && (
        <div className="animate-pulse space-y-2 px-8 pb-8 pt-5" aria-hidden="true">
          <div className="mx-auto h-3 w-4/5 rounded-full bg-slate-100" />
          <div className="mx-auto h-3 w-3/5 rounded-full bg-slate-100" />
          <div className="mx-auto mt-5 h-20 w-full max-w-md rounded-xl bg-slate-50" />
        </div>
      )}

      {variant === 'panel' && (
        <div className="animate-pulse space-y-3 px-4 pb-5 pt-4 sm:px-5" aria-hidden="true">
          <div className="h-10 w-full rounded-xl bg-slate-100" />
          <div className="h-10 w-full rounded-xl bg-slate-100" />
          <div className="h-10 w-4/5 rounded-xl bg-slate-100" />
        </div>
      )}

      <span className="sr-only">{label}</span>
    </div>
  );
}
