'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

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
  name: string;
  role: UserRole;
  roleTitle: string;
  email: string;
  department: string;
}

const titles: Record<UserRole, string> = {
  Admin: 'Administrator View',
  ProcessOwner: 'Process Owner View',
  ControlOwner: 'Control Owner View',
  Tester: 'Independent Tester View',
  Reviewer: 'Reviewer View',
  Executive: 'Executive View',
  Auditor: 'Auditor View'
};

export const USERS = Object.fromEntries(
  (Object.keys(titles) as UserRole[]).map((role) => [
    role,
    {
      id: `role-${role.toLowerCase()}`,
      name: 'No authenticated user',
      role,
      roleTitle: titles[role],
      email: '',
      department: ''
    }
  ])
) as Record<UserRole, UserProfile>;

interface RoleContextType {
  currentUser: UserProfile;
  setRole: (role: UserRole) => void;
  institutionName: string;
  setInstitutionName: (name: string) => void;
  authEnforced: boolean;
  authenticated: boolean;
  refreshAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(titles, value);
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [currentRole, setCurrentRole] = useState<UserRole>('Admin');
  const [authenticatedUser, setAuthenticatedUser] = useState<UserProfile | null>(null);
  const [authEnforced, setAuthEnforced] = useState(false);
  const [institutionName, setInstitutionName] = useState('No institution registered');

  const refreshAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      setAuthEnforced(Boolean(data.enforced));

      if (data.user && isUserRole(data.user.role)) {
        setAuthenticatedUser({
          id: String(data.user.id || ''),
          name: String(data.user.name || ''),
          role: data.user.role,
          roleTitle: titles[data.user.role],
          email: String(data.user.email || ''),
          department: String(data.user.department || '')
        });
        if (data.user.institutionName) {
          setInstitutionName(String(data.user.institutionName));
        }
      } else {
        setAuthenticatedUser(null);
      }
    } catch {
      setAuthenticatedUser(null);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();

    fetch('/api/assurance')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Unable to load institution'))))
      .then((data) => setInstitutionName(data.institution?.name || 'No institution registered'))
      .catch(() => undefined);
  }, [refreshAuth]);

  const setRole = (role: UserRole) => {
    if (!authEnforced) setCurrentRole(role);
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAuthenticatedUser(null);
    await refreshAuth();
    window.location.assign('/login');
  };

  return (
    <RoleContext.Provider
      value={{
        currentUser: authenticatedUser || USERS[currentRole],
        setRole,
        institutionName,
        setInstitutionName,
        authEnforced,
        authenticated: Boolean(authenticatedUser),
        refreshAuth,
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
