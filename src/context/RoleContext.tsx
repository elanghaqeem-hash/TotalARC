'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ROLE_TITLES, type UserRole } from '@/lib/access-control';

export type { UserRole } from '@/lib/access-control';

export interface InstitutionOption {
  id: string;
  name: string;
  legalName: string;
  shortName: string;
  institutionType: string;
  country: string;
}

export interface UserProfile {
  id: string;
  institutionId: string | null;
  institutionName: string;
  orgUnitId: string | null;
  name: string;
  role: UserRole;
  roleTitle: string;
  email: string;
  department: string;
  mustChangePassword?: boolean;
}

const loadingUser: UserProfile = {
  id: '',
  institutionId: null,
  institutionName: '',
  orgUnitId: null,
  name: '',
  role: 'Admin',
  roleTitle: ROLE_TITLES.Admin,
  email: '',
  department: ''
};

interface RoleContextType {
  currentUser: UserProfile;
  authenticated: boolean;
  loading: boolean;
  institutionName: string;
  institutionOptions: InstitutionOption[];
  canSwitchInstitution: boolean;
  setInstitutionName: (name: string) => void;
  refreshSession: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile>(loadingUser);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [institutionOptions, setInstitutionOptions] = useState<InstitutionOption[]>([]);
  const [canSwitchInstitution, setCanSwitchInstitution] = useState(false);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin'
      });

      if (!response.ok) {
        setAuthenticated(false);
        setCurrentUser(loadingUser);
        setInstitutionOptions([]);
        setCanSwitchInstitution(false);
        return false;
      }

      const payload = await response.json();
      if (!payload?.authenticated || !payload?.user) {
        setAuthenticated(false);
        setCurrentUser(loadingUser);
        setInstitutionOptions([]);
        setCanSwitchInstitution(false);
        return false;
      }

      setCurrentUser(payload.user as UserProfile);
      setInstitutionOptions(Array.isArray(payload.institutions) ? payload.institutions : []);
      setCanSwitchInstitution(Boolean(payload.canSwitchInstitution));
      setAuthenticated(true);
      return true;
    } catch {
      setAuthenticated(false);
      setCurrentUser(loadingUser);
      setInstitutionOptions([]);
      setCanSwitchInstitution(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const setInstitutionName = useCallback((name: string) => {
    setCurrentUser(current => ({ ...current, institutionName: name }));
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin'
      });
    } finally {
      setAuthenticated(false);
      setCurrentUser(loadingUser);
      setInstitutionOptions([]);
      setCanSwitchInstitution(false);
      window.location.assign('/login');
    }
  }, []);

  return (
    <RoleContext.Provider
      value={{
        currentUser,
        authenticated,
        loading,
        institutionName: currentUser.institutionName || 'No institution registered',
        institutionOptions,
        canSwitchInstitution,
        setInstitutionName,
        refreshSession,
        logout
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
