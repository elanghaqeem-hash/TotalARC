'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole =
  | 'Admin'
  | 'ProcessOwner'
  | 'ControlOwner'
  | 'Tester'
  | 'Reviewer'
  | 'Executive';

export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  roleTitle: string;
  email: string;
  department: string;
}

export const USERS: Record<UserRole, UserProfile> = {
  Admin: {
    id: 'user-admin',
    name: 'Satria Pratama',
    role: 'Admin',
    roleTitle: 'Platform Administrator',
    email: 'satria.admin@nusantaradigital.id',
    department: 'Enterprise GRC & Architecture'
  },
  ProcessOwner: {
    id: 'user-po',
    name: 'Maya Indira',
    role: 'ProcessOwner',
    roleTitle: 'Process Owner (VP Finance & Ops)',
    email: 'maya.indira@nusantaradigital.id',
    department: 'Finance & Treasury'
  },
  ControlOwner: {
    id: 'user-co',
    name: 'Rizky Ananda',
    role: 'ControlOwner',
    roleTitle: 'Control Owner (AP Manager)',
    email: 'rizky.ananda@nusantaradigital.id',
    department: 'Accounts Payable'
  },
  Tester: {
    id: 'user-tester',
    name: 'Kevin Sanjaya',
    role: 'Tester',
    roleTitle: 'Independent Control Tester',
    email: 'kevin.tester@nusantaradigital.id',
    department: 'Internal Control'
  },
  Reviewer: {
    id: 'user-reviewer',
    name: 'Dian Sastrowardoyo',
    role: 'Reviewer',
    roleTitle: 'Assurance Lead & Reviewer',
    email: 'dian.reviewer@nusantaradigital.id',
    department: 'Internal Audit & Assurance'
  },
  Executive: {
    id: 'user-exec',
    name: 'Budi Santoso',
    role: 'Executive',
    roleTitle: 'Chief Financial Officer (CFO)',
    email: 'budi.cfo@nusantaradigital.id',
    department: 'Executive Board'
  }
};

interface RoleContextType {
  currentUser: UserProfile;
  setRole: (role: UserRole) => void;
  institutionName: string;
  setInstitutionName: (name: string) => void;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [currentRole, setCurrentRole] = useState<UserRole>('Admin');
  const [institutionName, setInstitutionName] = useState<string>('PT Nusantara Digital Services');

  const currentUser = USERS[currentRole];

  const setRole = (role: UserRole) => {
    setCurrentRole(role);
  };

  return (
    <RoleContext.Provider
      value={{
        currentUser,
        setRole,
        institutionName,
        setInstitutionName
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}
