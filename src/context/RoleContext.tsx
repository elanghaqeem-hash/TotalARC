'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

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
  institutionId: string;
  institutionName: string;
  name: string;
  email: string;
  role: UserRole | string;
  department: string | null;
}

interface RoleContextType {
  currentUser: UserProfile | null;
  institutionName: string;
  loadingUser: boolean;
  refreshUser: () => Promise<void>;
  setInstitutionName: (name: string) => void;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [localInstitutionName, setLocalInstitutionName] = useState('');

  const refreshUser = async () => {
    setLoadingUser(true);
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (!res.ok) {
        setCurrentUser(null);
        setLocalInstitutionName('');
        return;
      }
      const data = await res.json();
      setCurrentUser(data.user || null);
      setLocalInstitutionName(data.user?.institutionName || '');
    } catch {
      setCurrentUser(null);
      setLocalInstitutionName('');
    } finally {
      setLoadingUser(false);
    }
  };

  useEffect(() => {
    void refreshUser();
  }, []);

  const value = useMemo(
    () => ({
      currentUser,
      institutionName: localInstitutionName || currentUser?.institutionName || '',
      loadingUser,
      refreshUser,
      setInstitutionName: setLocalInstitutionName
    }),
    [currentUser, localInstitutionName, loadingUser]
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) throw new Error('useRole must be used within a RoleProvider');
  return context;
}
