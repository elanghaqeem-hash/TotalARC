'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type UserRole =
  | 'Admin'
  | 'ProcessOwner'
  | 'ControlOwner'
  | 'Tester'
  | 'Reviewer'
  | 'Executive'
  | 'Auditor';

export interface UserProfile {
  id: string;
  institutionId: string | null;
  name: string;
  role: UserRole;
  roleTitle: string;
  email: string;
  department: string;
  orgUnitId: string | null;
  accessScope: 'Institution' | 'Unit' | 'UnitAndDescendants';
}

const titles: Record<UserRole, string> = {
  Admin: 'Administrator',
  ProcessOwner: 'Process Owner',
  ControlOwner: 'Control Owner',
  Tester: 'Independent Tester',
  Reviewer: 'Reviewer / Approver',
  Executive: 'Executive Management',
  Auditor: 'Auditor / Read-Only Assurance'
};

interface RoleContextType {
  currentUser: UserProfile | null;
  authLoading: boolean;
  authError: string;
  institutionName: string;
  setInstitutionName: (name: string) => void;
  refreshAuth: () => Promise<void>;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

function toProfile(value: unknown): UserProfile | null {
  if (!value || typeof value !== 'object') return null;
  const user = value as Record<string, unknown>;
  const role = user.role as UserRole;
  if (!titles[role]) return null;

  return {
    id: typeof user.id === 'string' ? user.id : '',
    institutionId: typeof user.institutionId === 'string' ? user.institutionId : null,
    name: typeof user.name === 'string' ? user.name : '',
    role,
    roleTitle: titles[role],
    email: typeof user.email === 'string' ? user.email : '',
    department: typeof user.department === 'string' ? user.department : '',
    orgUnitId: typeof user.orgUnitId === 'string' ? user.orgUnitId : null,
    accessScope:
      user.accessScope === 'Unit' || user.accessScope === 'UnitAndDescendants'
        ? user.accessScope
        : 'Institution'
  };
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [institutionName, setInstitutionName] = useState('No institution registered');

  const refreshAuth = async () => {
    setAuthLoading(true);
    setAuthError('');

    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      const payload = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          typeof payload.error === 'string' ? payload.error : 'Authentication required'
        );
      }

      const profile = toProfile(payload.user);
      if (!profile) throw new Error('Authenticated user profile is invalid.');
      setCurrentUser(profile);
    } catch (error) {
      setCurrentUser(null);
      setAuthError(error instanceof Error ? error.message : 'Authentication required');
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    void refreshAuth();

    fetch('/api/assurance', { cache: 'no-store' })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error('Unable to load institution'))
      )
      .then((data) =>
        setInstitutionName(data.institution?.name || 'No institution registered')
      )
      .catch(() => setInstitutionName('No institution registered'));
  }, []);

  return (
    <RoleContext.Provider
      value={{
        currentUser,
        authLoading,
        authError,
        institutionName,
        setInstitutionName,
        refreshAuth
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) throw new Error('useRole must be used within a RoleProvider');
  return context;
}
