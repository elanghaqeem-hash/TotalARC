export const USER_ROLES = [
  'Admin',
  'InstitutionAdmin',
  'RiskManager',
  'ComplianceOfficer',
  'InternalAuditor',
  'ICOFRCoordinator',
  'RCSACoordinator',
  'ProcessOwner',
  'ControlOwner',
  'EvidenceContributor',
  'Tester',
  'Reviewer',
  'Executive',
  'ReadOnlyAuditor'
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_TITLES: Record<UserRole, string> = {
  Admin: 'Administrator Sistem / Multi-Institusi',
  InstitutionAdmin: 'Administrator Institusi',
  RiskManager: 'Manajemen Risiko',
  ComplianceOfficer: 'Kepatuhan',
  InternalAuditor: 'Audit Internal / SKAI',
  ICOFRCoordinator: 'Koordinator ICOFR',
  RCSACoordinator: 'Koordinator RCSA / CSA',
  ProcessOwner: 'Pemilik Proses',
  ControlOwner: 'Pemilik Kontrol',
  EvidenceContributor: 'Kontributor Bukti',
  Tester: 'Penguji Independen',
  Reviewer: 'Reviewer / Approver',
  Executive: 'Direksi / Eksekutif',
  ReadOnlyAuditor: 'Auditor Read-Only'
};

type AccessRule = {
  path: string;
  exact?: boolean;
};

const COMMON_READ = [
  { path: '/', exact: true },
  { path: '/calendar' },
  { path: '/tasks' },
  { path: '/reports' }
] satisfies AccessRule[];

const ICOFR_PAGES = [
  { path: '/icofr' },
  { path: '/tod' },
  { path: '/toe' },
  { path: '/remediation' },
  { path: '/evidence' },
  { path: '/certification' }
] satisfies AccessRule[];

const PAGE_ACCESS: Record<UserRole, AccessRule[]> = {
  Admin: [{ path: '/' }],
  InstitutionAdmin: [
    { path: '/' },
    { path: '/admin/users' },
    { path: '/admin/security' },
    { path: '/organization' },
    { path: '/onboarding' }
  ],
  RiskManager: [
    ...COMMON_READ,
    { path: '/processes' },
    { path: '/risks' },
    { path: '/controls' },
    { path: '/rcm' },
    { path: '/rcsa' },
    { path: '/remediation' },
    { path: '/health' },
    { path: '/ccm' }
  ],
  ComplianceOfficer: [
    ...COMMON_READ,
    { path: '/processes' },
    { path: '/risks' },
    { path: '/controls' },
    { path: '/rcm' },
    { path: '/rcsa' },
    { path: '/evidence' },
    { path: '/remediation' },
    { path: '/health' },
    { path: '/certification' },
    { path: '/icofr/reporting' }
  ],
  InternalAuditor: [
    ...COMMON_READ,
    { path: '/processes' },
    { path: '/risks' },
    { path: '/controls' },
    { path: '/rcm' },
    { path: '/rcsa' },
    { path: '/health' },
    { path: '/ccm' },
    ...ICOFR_PAGES
  ],
  ICOFRCoordinator: [
    ...COMMON_READ,
    { path: '/processes' },
    { path: '/risks' },
    { path: '/controls' },
    { path: '/rcm' },
    { path: '/health' },
    ...ICOFR_PAGES
  ],
  RCSACoordinator: [
    ...COMMON_READ,
    { path: '/processes' },
    { path: '/risks' },
    { path: '/controls' },
    { path: '/rcm' },
    { path: '/rcsa' },
    { path: '/remediation' },
    { path: '/health' }
  ],
  ProcessOwner: [
    ...COMMON_READ,
    { path: '/processes' },
    { path: '/risks' },
    { path: '/controls' },
    { path: '/rcm' },
    { path: '/rcsa' },
    { path: '/remediation' }
  ],
  ControlOwner: [
    ...COMMON_READ,
    { path: '/controls' },
    { path: '/rcm' },
    { path: '/rcsa' },
    { path: '/evidence' },
    { path: '/tod' },
    { path: '/toe' },
    { path: '/remediation' },
    { path: '/health' },
    { path: '/ccm' }
  ],
  EvidenceContributor: [
    ...COMMON_READ,
    { path: '/controls' },
    { path: '/rcm' },
    { path: '/evidence' }
  ],
  Tester: [
    ...COMMON_READ,
    { path: '/controls' },
    { path: '/rcm' },
    { path: '/evidence' },
    { path: '/icofr', exact: true },
    { path: '/icofr/testing-plan' },
    { path: '/icofr/smart-testing' },
    { path: '/icofr/sampling-evidence' },
    { path: '/icofr/workpaper-review' },
    { path: '/tod' },
    { path: '/toe' }
  ],
  Reviewer: [
    ...COMMON_READ,
    { path: '/processes' },
    { path: '/risks' },
    { path: '/controls' },
    { path: '/rcm' },
    { path: '/rcsa' },
    { path: '/evidence' },
    { path: '/icofr' },
    { path: '/tod' },
    { path: '/toe' },
    { path: '/remediation' },
    { path: '/health' },
    { path: '/ccm' },
    { path: '/certification' }
  ],
  Executive: [
    ...COMMON_READ,
    { path: '/health' },
    { path: '/certification' },
    { path: '/icofr/reporting' }
  ],
  ReadOnlyAuditor: [
    ...COMMON_READ,
    { path: '/processes' },
    { path: '/risks' },
    { path: '/controls' },
    { path: '/rcm' },
    { path: '/rcsa' },
    { path: '/evidence' },
    { path: '/health' },
    { path: '/ccm' },
    ...ICOFR_PAGES
  ]
};

function matches(rule: AccessRule, pathname: string) {
  if (rule.path === '/' && !rule.exact) return true;
  if (rule.exact) return pathname === rule.path;
  return pathname === rule.path || pathname.startsWith(rule.path + '/');
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

export function canAccessPage(role: UserRole, pathname: string) {
  if (pathname === '/profile') return true;
  if (role === 'Admin') return true;
  return PAGE_ACCESS[role].some(rule => matches(rule, pathname));
}

export function canAdministerTenantUsers(role: UserRole) {
  return role === 'Admin' || role === 'InstitutionAdmin';
}

export function canAssignRole(actorRole: UserRole, targetRole: UserRole) {
  if (actorRole === 'Admin') return true;
  if (actorRole !== 'InstitutionAdmin') return false;
  return targetRole !== 'Admin' && targetRole !== 'InstitutionAdmin';
}

const API_PAGE_MAP: Array<{ api: string; page: string }> = [
  { api: '/api/dashboard', page: '/' },
  { api: '/api/onboarding', page: '/onboarding' },
  { api: '/api/organization', page: '/organization' },
  { api: '/api/processes', page: '/processes' },
  { api: '/api/risks', page: '/risks' },
  { api: '/api/controls', page: '/controls' },
  { api: '/api/rcm', page: '/rcm' },
  { api: '/api/evidence', page: '/evidence' },
  { api: '/api/admin/users', page: '/admin/users' },
  { api: '/api/admin/security', page: '/admin/security' },
  { api: '/api/assure/toe', page: '/toe' },
  { api: '/api/assure/remediation', page: '/remediation' },
  { api: '/api/monitor/ccm', page: '/ccm' },
  { api: '/api/icofr/certification', page: '/certification' },
  { api: '/api/icofr/reporting', page: '/icofr/reporting' },
  { api: '/api/icofr/scoping', page: '/icofr/scoping' },
  { api: '/api/icofr/financial-items', page: '/icofr/accounts' },
  { api: '/api/icofr/coverage', page: '/icofr/coverage' },
  { api: '/api/icofr/information', page: '/icofr/information' },
  { api: '/api/icofr/period-close', page: '/icofr/period-close' },
  { api: '/api/icofr/roll-forward', page: '/icofr/roll-forward' },
  { api: '/api/icofr/sampling-evidence', page: '/icofr/sampling-evidence' },
  { api: '/api/icofr/smart-testing', page: '/icofr/smart-testing' },
  { api: '/api/icofr/testing-plan', page: '/icofr/testing-plan' },
  { api: '/api/icofr/traceability', page: '/icofr/traceability' },
  { api: '/api/icofr/workpaper-review', page: '/icofr/workpaper-review' },
  { api: '/api/icofr/deficiencies', page: '/icofr/deficiencies' },
  { api: '/api/icofr/hub', page: '/icofr' },
  { api: '/api/icofr/controls', page: '/icofr' }
];

function mappedPageForApi(pathname: string) {
  const match = API_PAGE_MAP.find(
    item => pathname === item.api || pathname.startsWith(item.api + '/')
  );
  return match?.page || null;
}

function isReadOnlyMethod(method: string) {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

export function canAccessApi(role: UserRole, pathname: string, method: string) {
  if (pathname === '/api/auth/profile') return true;
  if (role === 'Admin') return true;

  if (pathname.startsWith('/api/ai/')) return true;
  if (pathname === '/api/assurance') {
    if (isReadOnlyMethod(method)) {
      return [
        'InstitutionAdmin', 'RiskManager', 'ComplianceOfficer', 'InternalAuditor',
        'ICOFRCoordinator', 'RCSACoordinator', 'ProcessOwner', 'ControlOwner',
        'Tester', 'Reviewer', 'ReadOnlyAuditor'
      ].includes(role);
    }
    return [
      'InstitutionAdmin', 'RiskManager', 'InternalAuditor', 'ICOFRCoordinator',
      'RCSACoordinator', 'ProcessOwner', 'ControlOwner', 'Tester', 'Reviewer'
    ].includes(role);
  }

  const page = mappedPageForApi(pathname);
  if (!page || !canAccessPage(role, page)) return false;

  if (isReadOnlyMethod(method)) return true;
  if (role === 'Executive' || role === 'ReadOnlyAuditor' || role === 'ComplianceOfficer') {
    return false;
  }

  if (role === 'InstitutionAdmin') return true;

  if (role === 'RiskManager') {
    return (
      pathname.startsWith('/api/processes') ||
      pathname.startsWith('/api/risks') ||
      pathname.startsWith('/api/controls') ||
      pathname.startsWith('/api/rcm') ||
      pathname.startsWith('/api/assure/remediation')
    );
  }

  if (role === 'InternalAuditor') {
    return (
      pathname.startsWith('/api/assurance') ||
      pathname.startsWith('/api/assure/') ||
      pathname.startsWith('/api/icofr/') ||
      pathname.startsWith('/api/evidence')
    );
  }

  if (role === 'ICOFRCoordinator') {
    return (
      pathname.startsWith('/api/icofr/') ||
      pathname.startsWith('/api/assurance') ||
      pathname.startsWith('/api/assure/') ||
      pathname.startsWith('/api/evidence') ||
      pathname.startsWith('/api/controls') ||
      pathname.startsWith('/api/rcm')
    );
  }

  if (role === 'RCSACoordinator') {
    return (
      pathname.startsWith('/api/processes') ||
      pathname.startsWith('/api/risks') ||
      pathname.startsWith('/api/controls') ||
      pathname.startsWith('/api/rcm') ||
      pathname.startsWith('/api/assurance') ||
      pathname.startsWith('/api/assure/remediation')
    );
  }

  if (role === 'EvidenceContributor') {
    return pathname.startsWith('/api/evidence');
  }

  if (role === 'Reviewer') {
    return (
      pathname.startsWith('/api/assurance') ||
      pathname.startsWith('/api/assure/') ||
      pathname.startsWith('/api/icofr/') ||
      pathname.startsWith('/api/evidence')
    );
  }

  if (role === 'Tester') {
    return (
      pathname.startsWith('/api/assure/toe') ||
      pathname.startsWith('/api/evidence') ||
      pathname.startsWith('/api/icofr/testing-plan') ||
      pathname.startsWith('/api/icofr/sampling-evidence') ||
      pathname.startsWith('/api/icofr/workpaper-review') ||
      pathname.startsWith('/api/icofr/smart-testing') ||
      pathname.startsWith('/api/assurance')
    );
  }

  if (role === 'ProcessOwner') {
    return (
      pathname.startsWith('/api/processes') ||
      pathname.startsWith('/api/risks') ||
      pathname.startsWith('/api/controls') ||
      pathname.startsWith('/api/rcm') ||
      pathname.startsWith('/api/assure/remediation') ||
      pathname.startsWith('/api/assurance')
    );
  }

  if (role === 'ControlOwner') {
    return (
      pathname.startsWith('/api/controls') ||
      pathname.startsWith('/api/rcm') ||
      pathname.startsWith('/api/evidence') ||
      pathname.startsWith('/api/assure/remediation') ||
      pathname.startsWith('/api/monitor/ccm') ||
      pathname.startsWith('/api/assurance')
    );
  }

  return false;
}
