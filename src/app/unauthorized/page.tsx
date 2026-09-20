'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-black text-slate-900">Access not authorized</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Your authenticated role is not permitted to access this Total ARC resource. Authorization is enforced server-side when authentication enforcement is enabled.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/" className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white">Return to dashboard</Link>
          <Link href="/profile" className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-700">View profile</Link>
        </div>
      </div>
    </main>
  );
}
