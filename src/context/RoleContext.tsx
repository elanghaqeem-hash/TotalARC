'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type UserRole = 'Admin' | 'ProcessOwner' | 'ControlOwner' | 'Tester' | 'Reviewer' | 'Executive';

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
  Executive: 'Executive View'
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
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [currentRole, setCurrentRole] = useState<UserRole>('Admin');
  const [institutionName, setInstitutionName] = useState('No institution registered');

  useEffect(() => {
    fetch('/api/assurance')
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('Unable to load institution')))
      .then((data) => setInstitutionName(data.institution?.name || 'No institution registered'))
      .catch(() => setInstitutionName('No institution registered'));
  }, []);

  return (
    <RoleContext.Provider
      value={{ currentUser: USERS[currentRole], setRole: setCurrentRole, institutionName, setInstitutionName }}
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
