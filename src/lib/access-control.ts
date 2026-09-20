export const USER_ROLES = [
  'Admin',
  'ProcessOwner',
  'ControlOwner',
  'Tester',
  'Reviewer',
  'Executive'
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_TITLES: Record<UserRole, string> = {
  Admin: 'Administrator',
  ProcessOwner: 'Process Owner',
  ControlOwner: 'Control Owner',
  Tester: 'Independent Tester',
  Reviewer: 'Reviewer / Approver',
  Executive: 'Executive'
};

type AccessRule = {
  path: string;
  exact?: boolean;
};

const PAGE_ACCESS: Record<UserRole, AccessRule[]> = {
  Admin: [{ path: '/' }],
  ProcessOwner: [
    { path: '/', exact: true },
    { path: '/processes' },
    { path: '/risks' },
    { path: '/controls' },
    { path: '/rcm' },
    { path: '/rcsa' },
    { path: '/remediation' },
    { path: '/calendar' },
    { path: '/tasks' },
    { path: '/reports' }
  ],
  ControlOwner: [
    { path: '/', exact: true },
    { path: '/controls' },
    { path: '/rcm' },
    { path: '/rcsa' },
    { path: '/evidence' },
    { path: '/tod' },
    { path: '/toe' },
    { path: '/remediation' },
    { path: '/health' },
    { path: '/ccm' },
    { path: '/calendar' },
    { path: '/tasks' },
    { path: '/reports' }
  ],
  Tester: [
    { path: '/', exact: true },
    { path: '/controls' },
    { path: '/rcm' },
    { path: '/evidence' },
    { path: '/icofr', exact: true },
    { path: '/icofr/testing-plan' },
    { path: '/icofr/smart-testing' },
    { path: '/icofr/sampling-evidence' },
    { path: '/icofr/workpaper-review' },
    { path: '/tod' },
    { path: '/toe' },
    { path: '/calendar' },
    { path: '/tasks' },
    { path: '/reports' }
  ],
  Reviewer: [
    { path: '/', exact: true },
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
    { path: '/certification' },
    { path: '/calendar' },
    { path: '/tasks' },
    { path: '/reports' }
  ],
  Executive: [
    { path: '/', exact: true },
    { path: '/health' },
    { path: '/certification' },
    { path: '/icofr/reporting' },
    { path: '/calendar' },
    { path: '/reports' }
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

const API_PAGE_MAP: Array<{ api: string; page: string }> = [
  { api: '/api/dashboard', page: '/' },
  { api: '/api/onboarding', page: '/onboarding' },
  { api: '/api/organization', page: '/organization' },
  { api: '/api/processes', page: '/processes' },
  { api: '/api/risks', page: '/risks' },
  { api: '/api/controls', page: '/controls' },
  { api: '/api/rcm', page: '/rcm' },
  { api: '/api/evidence', page: '/evidence' },
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

export function canAccessApi(role: UserRole, pathname: string, method: string) {
  if (pathname === '/api/auth/profile') return true;
  if (role === 'Admin') return true;

  if (pathname.startsWith('/api/ai/')) return true;
  if (pathname === '/api/assurance') {
    return ['ProcessOwner', 'ControlOwner', 'Tester', 'Reviewer'].includes(role);
  }

  const page = mappedPageForApi(pathname);
  if (!page || !canAccessPage(role, page)) return false;

  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  if (role === 'Executive') return false;

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
