import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return 'IDR 0';
  if (amount >= 1_000_000_000) {
    return `IDR ${(amount / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} Miliar`;
  }
  if (amount >= 1_000_000) {
    return `IDR ${(amount / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 0 })} Juta`;
  }
  return `IDR ${amount.toLocaleString('id-ID')}`;
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function getRiskBadgeClasses(rating: string | undefined): { bg: string; text: string; border: string } {
  switch (rating?.toLowerCase()) {
    case 'critical':
      return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
    case 'high':
      return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' };
    case 'medium':
      return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
    case 'low':
      return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
    default:
      return { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' };
  }
}

export function getHealthBadgeClasses(health: string | undefined): { bg: string; text: string; dot: string } {
  switch (health?.toLowerCase()) {
    case 'healthy':
    case 'effective':
    case 'passed':
    case 'certified':
    case 'closed':
      return { bg: 'bg-emerald-50 text-emerald-800 border-emerald-200', text: 'text-emerald-800', dot: 'bg-emerald-500' };
    case 'attention':
    case 'attention required':
    case 'partially effective':
    case 'partially passed':
    case 'in progress':
      return { bg: 'bg-amber-50 text-amber-800 border-amber-200', text: 'text-amber-800', dot: 'bg-amber-500' };
    case 'deficient':
    case 'ineffective':
    case 'failed':
    case 'high':
    case 'critical':
    case 'overdue':
      return { bg: 'bg-rose-50 text-rose-800 border-rose-200', text: 'text-rose-800', dot: 'bg-rose-500' };
    default:
      return { bg: 'bg-slate-100 text-slate-700 border-slate-200', text: 'text-slate-700', dot: 'bg-slate-400' };
  }
}
