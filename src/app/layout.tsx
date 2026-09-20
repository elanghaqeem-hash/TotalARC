import type { Metadata } from 'next';
import './globals.css';
import { RoleProvider } from '@/context/RoleContext';
import { AppFrame } from '@/components/layout/AppFrame';

export const metadata: Metadata = {
  title: 'TOTAL ARC — Total Assurance, Risk & Control Platform',
  description: 'Enterprise Business Process, Risk, Internal Control & Assurance Management Platform. One Platform. Total Risk & Control Assurance.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-50 text-slate-900">
        <RoleProvider>
          <AppFrame>{children}</AppFrame>
        </RoleProvider>
      </body>
    </html>
  );
}
