'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  AUTH_ROLES,
  ROLE_TITLES,
  type AuthRole
} from '@/lib/auth-token';

export type UserRole = AuthRole | 'Unauthenticated';

export interface UserProfile {
  id: string;
  institutionId: string;
  institutionName: string;
  institutionShortName: string;
  name: string;
  role: UserRole;
  roleTitle: string;
  email: string;
  department: string;
  primaryOrgUnitId: string;
  employeeId: string;
  jobTitle: string;
  phone: string;
  mustChangePassword: boolean;
  authenticated: boolean;
}

const unauthenticatedUser: UserProfile = {
  id: '',
  institutionId: '',
  institutionName: 'No authenticated institution',
  institutionShortName: '',
  name: 'Sign in required',
  role: 'Unauthenticated',
  roleTitle: 'Unauthenticated session',
  email: '',
  department: '',
  primaryOrgUnitId: '',
  employeeId: '',
  jobTitle: '',
  phone: '',
  mustChangePassword: false,
  authenticated: false
};

export const USERS = Object.fromEntries(
  AUTH_ROLES.map(role => [
    role,
    {
      ...unauthenticatedUser,
      role,
      roleTitle: ROLE_TITLES[role],
      name: 'No authenticated user'
    }
  ])
) as Record<AuthRole, UserProfile>;

interface RoleContextType {
  currentUser: UserProfile;
  setRole: (role: UserRole) => void;
  institutionName: string;
  setInstitutionName: (name: string) => void;
  authenticated: boolean;
  enforcement: boolean;
  loading: boolean;
  refreshSession: () => Promise<void>;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile>(unauthenticatedUser);
  const [institutionName, setInstitutionName] = useState('No authenticated institution');
  const [authenticated, setAuthenticated] = useState(false);
  const [enforcement, setEnforcement] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/session', {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const body = await response.json().catch(() => ({}));
      setEnforcement(Boolean(body.enforcement));

      if (!response.ok || !body.authenticated || !body.user) {
        setAuthenticated(false);
        setCurrentUser(unauthenticatedUser);
        setInstitutionName('No authenticated institution');
        return;
      }

      const role = AUTH_ROLES.includes(body.user.role as AuthRole)
        ? (body.user.role as AuthRole)
        : 'Unauthenticated';

      const next: UserProfile = {
        id: String(body.user.id || ''),
        institutionId: String(body.user.institutionId || ''),
        institutionName: String(body.user.institutionName || ''),
        institutionShortName: String(body.user.institutionShortName || ''),
        name: String(body.user.name || ''),
        role,
        roleTitle: role === 'Unauthenticated' ? 'Unauthenticated session' : ROLE_TITLES[role],
        email: String(body.user.email || ''),
        department: String(body.user.primaryOrgUnitName || ''),
        primaryOrgUnitId: String(body.user.primaryOrgUnitId || ''),
        employeeId: String(body.user.employeeId || ''),
        jobTitle: String(body.user.jobTitle || ''),
        phone: String(body.user.phone || ''),
        mustChangePassword: Boolean(body.user.mustChangePassword),
        authenticated: true
      };

      setCurrentUser(next);
      setInstitutionName(next.institutionName || next.institutionShortName || 'Authenticated institution');
      setAuthenticated(true);
    } catch {
      setAuthenticated(false);
      setCurrentUser(unauthenticatedUser);
      setInstitutionName('No authenticated institution');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  // Retained for compatibility with older components. Role impersonation is intentionally disabled.
  const setRole = useCallback((_role: UserRole) => {}, []);

  return (
    <RoleContext.Provider
      value={{
        currentUser,
        setRole,
        institutionName,
        setInstitutionName,
        authenticated,
        enforcement,
        loading,
        refreshSession
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
