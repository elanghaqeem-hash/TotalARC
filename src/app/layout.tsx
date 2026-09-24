import type { Metadata } from 'next';
import './globals.css';
import { RoleProvider } from '@/context/RoleContext';
import { AppShell } from '@/components/layout/AppShell';
import { IndonesianUiLocalizer } from '@/components/common/IndonesianUiLocalizer';

export const metadata: Metadata = {
  title: 'TOTAL ARC — Platform Terpadu Penjaminan, Risiko & Kontrol',
  description: 'Platform terintegrasi untuk proses bisnis, risiko, pengendalian internal, ICOFR, kepatuhan, audit, dan penjaminan.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="antialiased bg-slate-50 text-slate-900">
        <RoleProvider>
          <IndonesianUiLocalizer />
          <AppShell>{children}</AppShell>
        </RoleProvider>
      </body>
    </html>
  );
}
