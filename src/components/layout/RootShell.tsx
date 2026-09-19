'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';

const PUBLIC_PATHS = new Set(['/login', '/setup/admin']);

export function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const isPublic = PUBLIC_PATHS.has(pathname);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!cancelled && data.enforced && !data.user && !isPublic) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, [pathname, router, isPublic]);

  if (isPublic) return <>{children}</>;

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-xs font-semibold text-slate-500">Loading Total ARC…</div>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
