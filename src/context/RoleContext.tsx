'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PermissionKey } from '@/lib/security-model';

export interface InstitutionAccess {
  id: string;
  name: string;
  legalName?: string | null;
  databaseBinding: string;
  folderKey: string;
}

export interface UserProfile {
  id: string;
  username: string;
  name: string;
  employeeId?: string | null;
  email?: string | null;
  jobTitle?: string | null;
  role: string;
  roleTitle: string;
  roles: string[];
  permissions: PermissionKey[];
  unitIds: string[];
  department: string;
  mustChangePassword: boolean;
  institution: InstitutionAccess;
  institutions: InstitutionAccess[];
}

const anonymous: UserProfile = {
  id: '',
  username: '',
  name: 'Unauthenticated',
  email: null,
  role: '',
  roleTitle: 'Authentication required',
  roles: [],
  permissions: [],
  unitIds: [],
  department: '',
  mustChangePassword: false,
  institution: {
    id: '',
    name: 'No active institution',
    databaseBinding: 'DB',
    folderKey: ''
  },
  institutions: []
};

interface RoleContextType {
  currentUser: UserProfile;
  authenticated: boolean;
  loading: boolean;
  institutionName: string;
  hasPermission: (permission: PermissionKey) => boolean;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  switchInstitution: (institutionId: string) => Promise<void>;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

function normalizeUser(payload: any): UserProfile {
  const roles = Array.isArray(payload?.roles) ? payload.roles.map(String) : [];
  const primaryRole = roles[0] || 'Authenticated User';
  return {
    id: String(payload?.sub || ''),
    username: String(payload?.username || ''),
    name: String(payload?.displayName || payload?.username || 'Authenticated User'),
    employeeId: payload?.employeeId || null,
    email: payload?.email || null,
    jobTitle: payload?.jobTitle || null,
    role: primaryRole,
    roleTitle: roles.length > 1 ? roles.join(' · ') : primaryRole.replaceAll('_', ' '),
    roles,
    permissions: Array.isArray(payload?.permissions) ? payload.permissions : [],
    unitIds: Array.isArray(payload?.unitIds) ? payload.unitIds.map(String) : [],
    department: '',
    mustChangePassword: Boolean(payload?.mustChangePassword),
    institution: payload?.institution || anonymous.institution,
    institutions: Array.isArray(payload?.institutions) ? payload.institutions : []
  };
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile>(anonymous);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      if (!response.ok) {
        setCurrentUser(anonymous);
        setAuthenticated(false);
        return;
      }
      const body = await response.json();
      if (!body.authenticated || !body.user) {
        setCurrentUser(anonymous);
        setAuthenticated(false);
        return;
      }
      setCurrentUser(normalizeUser(body.user));
      setAuthenticated(true);
    } catch {
      setCurrentUser(anonymous);
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setCurrentUser(anonymous);
      setAuthenticated(false);
      window.location.assign('/login');
    }
  }, []);

  const switchInstitution = useCallback(async (institutionId: string) => {
    const response = await fetch('/api/auth/switch-institution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ institutionId })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Unable to switch institution.');
    setCurrentUser(normalizeUser(body.user));
    setAuthenticated(true);
    window.location.assign('/');
  }, []);

  const value = useMemo<RoleContextType>(() => ({
    currentUser,
    authenticated,
    loading,
    institutionName: currentUser.institution.name,
    hasPermission: permission => currentUser.permissions.includes(permission),
    refreshSession,
    logout,
    switchInstitution
  }), [currentUser, authenticated, loading, refreshSession, logout, switchInstitution]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) throw new Error('useRole must be used within a RoleProvider');
  return context;
}
