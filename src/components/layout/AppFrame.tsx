'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';

const PUBLIC_SHELLLESS = ['/login', '/security/setup', '/unauthorized'];

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (PUBLIC_SHELLLESS.some(path => pathname === path || pathname.startsWith(path + '/'))) {
    return <>{children}</>;
  }
  return <AppShell>{children}</AppShell>;
}
