export type PermissionKey =
  | 'dashboard.view'
  | 'institution.view'
  | 'institution.manage'
  | 'organization.view'
  | 'organization.manage'
  | 'process.view'
  | 'process.edit'
  | 'process.approve'
  | 'risk.view'
  | 'risk.edit'
  | 'risk.approve'
  | 'control.view'
  | 'control.edit'
  | 'control.approve'
  | 'rcm.view'
  | 'rcm.edit'
  | 'rcsa.view'
  | 'rcsa.assess'
  | 'rcsa.review'
  | 'rcsa.approve'
  | 'icofr.view'
  | 'icofr.prepare'
  | 'icofr.test'
  | 'icofr.review'
  | 'icofr.approve'
  | 'remediation.view'
  | 'remediation.own'
  | 'remediation.approve'
  | 'remediation.retest'
  | 'ccm.view'
  | 'ccm.manage'
  | 'certification.view'
  | 'certification.sign'
  | 'report.view'
  | 'report.export'
  | 'evidence.view'
  | 'evidence.manage'
  | 'task.view'
  | 'calendar.view'
  | 'ai.use'
  | 'profile.self'
  | 'user.view'
  | 'user.manage'
  | 'user.approve'
  | 'security.admin'
  | 'audit.view'
  | 'tenant.switch'
  | 'tenant.manage';

export type BankRoleKey =
  | 'PLATFORM_SUPER_ADMIN'
  | 'INSTITUTION_ADMIN'
  | 'USER_ADMIN_MAKER'
  | 'USER_ADMIN_APPROVER'
  | 'GRC_ADMIN'
  | 'ERM_MANAGER'
  | 'OPERATIONAL_RISK'
  | 'RISK_OWNER'
  | 'PROCESS_OWNER'
  | 'CONTROL_OWNER'
  | 'RCSA_ASSESSOR'
  | 'RCSA_REVIEWER'
  | 'RCSA_APPROVER'
  | 'ICOFR_MANAGER'
  | 'ICOFR_PREPARER'
  | 'ICOFR_TESTER'
  | 'ICOFR_REVIEWER'
  | 'INTERNAL_AUDIT'
  | 'COMPLIANCE'
  | 'CYBER_GRC'
  | 'BCM'
  | 'THIRD_PARTY_RISK'
  | 'REGULATORY_COMPLIANCE'
  | 'COMBINED_ASSURANCE'
  | 'EXECUTIVE'
  | 'AUDIT_COMMITTEE'
  | 'READ_ONLY_AUDITOR';

export type BankRoleDefinition = {
  key: BankRoleKey;
  name: string;
  category: 'Platform' | 'Administration' | 'Risk' | 'Business' | 'Assurance' | 'Oversight';
  description: string;
  permissions: PermissionKey[];
  privileged?: boolean;
  independentAssurance?: boolean;
};

const BASIC: PermissionKey[] = [
  'dashboard.view',
  'task.view',
  'calendar.view',
  'profile.self',
  'ai.use',
  'tenant.switch'
];

const VIEW_CORE: PermissionKey[] = [
  'organization.view',
  'process.view',
  'risk.view',
  'control.view',
  'rcm.view'
];

const VIEW_ASSURANCE: PermissionKey[] = [
  'rcsa.view',
  'icofr.view',
  'remediation.view',
  'ccm.view',
  'certification.view',
  'report.view',
  'evidence.view'
];

const ALL_PERMISSIONS: PermissionKey[] = [
  'dashboard.view','institution.view','institution.manage','organization.view','organization.manage',
  'process.view','process.edit','process.approve','risk.view','risk.edit','risk.approve',
  'control.view','control.edit','control.approve','rcm.view','rcm.edit',
  'rcsa.view','rcsa.assess','rcsa.review','rcsa.approve',
  'icofr.view','icofr.prepare','icofr.test','icofr.review','icofr.approve',
  'remediation.view','remediation.own','remediation.approve','remediation.retest',
  'ccm.view','ccm.manage','certification.view','certification.sign',
  'report.view','report.export','evidence.view','evidence.manage','task.view','calendar.view','ai.use','profile.self',
  'user.view','user.manage','user.approve','security.admin','audit.view','tenant.switch','tenant.manage'
];

function unique(...groups: PermissionKey[][]): PermissionKey[] {
  return Array.from(new Set(groups.flat()));
}

export const BANK_ROLE_CATALOG: BankRoleDefinition[] = [
  {
    key: 'PLATFORM_SUPER_ADMIN',
    name: 'Platform Super Administrator',
    category: 'Platform',
    description: 'Platform-level administration across institutions, security policy, tenant provisioning and emergency access.',
    permissions: ALL_PERMISSIONS,
    privileged: true
  },
  {
    key: 'INSTITUTION_ADMIN',
    name: 'Institution Administrator',
    category: 'Administration',
    description: 'Institution configuration, organization structure, user administration and institution-level parameters.',
    permissions: unique(BASIC, VIEW_CORE, VIEW_ASSURANCE, [
      'institution.view','institution.manage','organization.manage',
      'user.view','user.manage','user.approve','security.admin','audit.view'
    ]),
    privileged: true
  },
  {
    key: 'USER_ADMIN_MAKER',
    name: 'User Access Administrator (Maker)',
    category: 'Administration',
    description: 'Creates and maintains user/access requests but cannot approve the same access administration role.',
    permissions: unique(BASIC, ['user.view','user.manage','organization.view','audit.view']),
    privileged: true
  },
  {
    key: 'USER_ADMIN_APPROVER',
    name: 'User Access Administrator (Approver)',
    category: 'Administration',
    description: 'Reviews privileged user/access assignments and segregation-of-duty exceptions.',
    permissions: unique(BASIC, ['user.view','user.approve','organization.view','audit.view']),
    privileged: true
  },
  {
    key: 'GRC_ADMIN',
    name: 'GRC Administrator',
    category: 'Risk',
    description: 'Maintains GRC master data, methodology and cross-module configuration within the institution.',
    permissions: unique(BASIC, VIEW_CORE, VIEW_ASSURANCE, [
      'process.edit','risk.edit','control.edit','rcm.edit','rcsa.review',
      'icofr.prepare','ccm.manage','report.export','evidence.manage'
    ])
  },
  {
    key: 'ERM_MANAGER',
    name: 'Enterprise Risk Manager',
    category: 'Risk',
    description: 'Manages enterprise risk taxonomy, risk register, RCSA governance and risk reporting.',
    permissions: unique(BASIC, VIEW_CORE, VIEW_ASSURANCE, [
      'risk.edit','risk.approve','rcsa.review','rcsa.approve','report.export'
    ])
  },
  {
    key: 'OPERATIONAL_RISK',
    name: 'Operational Risk Officer',
    category: 'Risk',
    description: 'Maintains operational-risk assessments, events, RCSA campaigns and remediation monitoring.',
    permissions: unique(BASIC, VIEW_CORE, [
      'rcsa.view','rcsa.assess','rcsa.review','remediation.view','ccm.view','report.view'
    ])
  },
  {
    key: 'RISK_OWNER',
    name: 'Risk Owner',
    category: 'Business',
    description: 'Owns risk assessments and treatment decisions for assigned organizational units.',
    permissions: unique(BASIC, VIEW_CORE, [
      'risk.edit','rcsa.view','rcsa.assess','remediation.view','remediation.own'
    ])
  },
  {
    key: 'PROCESS_OWNER',
    name: 'Process Owner',
    category: 'Business',
    description: 'Maintains assigned business processes and participates in process/control assessments.',
    permissions: unique(BASIC, VIEW_CORE, [
      'process.edit','rcm.edit','rcsa.view','rcsa.assess','remediation.view','remediation.own'
    ])
  },
  {
    key: 'CONTROL_OWNER',
    name: 'Control Owner',
    category: 'Business',
    description: 'Maintains and performs assigned controls, responds to CSA and owns control remediation.',
    permissions: unique(BASIC, VIEW_CORE, [
      'control.edit','rcm.edit','rcsa.view','rcsa.assess',
      'remediation.view','remediation.own','certification.view','evidence.view','evidence.manage'
    ])
  },
  {
    key: 'RCSA_ASSESSOR',
    name: 'RCSA / CSA Assessor',
    category: 'Business',
    description: 'Performs assigned RCSA/CSA assessments and provides evidence for assigned units.',
    permissions: unique(BASIC, VIEW_CORE, ['rcsa.view','rcsa.assess','remediation.view','evidence.view','evidence.manage'])
  },
  {
    key: 'RCSA_REVIEWER',
    name: 'RCSA Reviewer',
    category: 'Risk',
    description: 'Reviews RCSA/CSA responses independently from the assessor.',
    permissions: unique(BASIC, VIEW_CORE, ['rcsa.view','rcsa.review','remediation.view','report.view'])
  },
  {
    key: 'RCSA_APPROVER',
    name: 'RCSA Approver',
    category: 'Risk',
    description: 'Approves completed RCSA cycles and management conclusions.',
    permissions: unique(BASIC, VIEW_CORE, ['rcsa.view','rcsa.review','rcsa.approve','report.view'])
  },
  {
    key: 'ICOFR_MANAGER',
    name: 'ICOFR Program Manager',
    category: 'Assurance',
    description: 'Owns ICOFR scope, control framework, testing plan, deficiency evaluation and certification workflow.',
    permissions: unique(BASIC, VIEW_CORE, VIEW_ASSURANCE, [
      'icofr.prepare','icofr.review','icofr.approve',
      'remediation.approve','certification.sign','report.export','evidence.manage'
    ])
  },
  {
    key: 'ICOFR_PREPARER',
    name: 'ICOFR Preparer',
    category: 'Assurance',
    description: 'Prepares ICOFR scope, financial items, assertions, control mapping and evidence.',
    permissions: unique(BASIC, VIEW_CORE, [
      'icofr.view','icofr.prepare','remediation.view','report.view','evidence.view','evidence.manage'
    ])
  },
  {
    key: 'ICOFR_TESTER',
    name: 'Independent ICOFR Tester',
    category: 'Assurance',
    description: 'Executes walkthrough, Test of Design and Test of Operating Effectiveness independently from control ownership.',
    permissions: unique(BASIC, VIEW_CORE, [
      'icofr.view','icofr.test','remediation.view','remediation.retest','report.view','evidence.view','evidence.manage'
    ]),
    independentAssurance: true
  },
  {
    key: 'ICOFR_REVIEWER',
    name: 'ICOFR Reviewer',
    category: 'Assurance',
    description: 'Reviews ICOFR workpapers, deficiencies and testing conclusions independently from preparation.',
    permissions: unique(BASIC, VIEW_CORE, [
      'icofr.view','icofr.review','remediation.view','remediation.approve','report.view','report.export'
    ]),
    independentAssurance: true
  },
  {
    key: 'INTERNAL_AUDIT',
    name: 'Internal Audit',
    category: 'Assurance',
    description: 'Independent assurance access to process, risk, control, testing, remediation and reporting records.',
    permissions: unique(BASIC, VIEW_CORE, VIEW_ASSURANCE, [
      'icofr.test','icofr.review','remediation.retest','report.export','audit.view','evidence.view'
    ]),
    independentAssurance: true
  },
  {
    key: 'COMPLIANCE',
    name: 'Compliance',
    category: 'Risk',
    description: 'Compliance-risk assessment, control oversight, issue follow-up and compliance reporting.',
    permissions: unique(BASIC, VIEW_CORE, VIEW_ASSURANCE, ['risk.edit','rcsa.review','report.export'])
  },
  {
    key: 'CYBER_GRC',
    name: 'Cyber GRC',
    category: 'Risk',
    description: 'Technology/cyber risk and control governance including ITGC/ITAC and continuous monitoring.',
    permissions: unique(BASIC, VIEW_CORE, [
      'risk.edit','control.edit','rcm.edit','icofr.view','icofr.prepare','ccm.view','ccm.manage','report.view'
    ])
  },
  {
    key: 'BCM',
    name: 'Business Continuity Management',
    category: 'Risk',
    description: 'Business continuity risk/control governance and remediation visibility.',
    permissions: unique(BASIC, VIEW_CORE, ['risk.edit','control.edit','rcsa.view','rcsa.assess','remediation.view','report.view'])
  },
  {
    key: 'THIRD_PARTY_RISK',
    name: 'Third-Party Risk',
    category: 'Risk',
    description: 'Third-party risk and control assessment for assigned business units/vendors.',
    permissions: unique(BASIC, VIEW_CORE, ['risk.edit','rcsa.view','rcsa.assess','remediation.view','report.view'])
  },
  {
    key: 'REGULATORY_COMPLIANCE',
    name: 'Regulatory Compliance',
    category: 'Risk',
    description: 'Regulatory obligation and compliance control oversight.',
    permissions: unique(BASIC, VIEW_CORE, VIEW_ASSURANCE, ['risk.edit','report.export'])
  },
  {
    key: 'COMBINED_ASSURANCE',
    name: 'Combined Assurance',
    category: 'Assurance',
    description: 'Cross-assurance consolidation across risk, compliance, internal audit and ICOFR.',
    permissions: unique(BASIC, VIEW_CORE, VIEW_ASSURANCE, ['report.export','audit.view'])
  },
  {
    key: 'EXECUTIVE',
    name: 'Executive Management',
    category: 'Oversight',
    description: 'Executive dashboards, reports, certifications and management sign-off.',
    permissions: unique(BASIC, VIEW_CORE, VIEW_ASSURANCE, ['certification.sign','report.export'])
  },
  {
    key: 'AUDIT_COMMITTEE',
    name: 'Board / Audit Committee',
    category: 'Oversight',
    description: 'Read-only board-level assurance, deficiency, remediation and certification visibility.',
    permissions: unique(BASIC, VIEW_CORE, VIEW_ASSURANCE, ['report.export','audit.view'])
  },
  {
    key: 'READ_ONLY_AUDITOR',
    name: 'External / Read-Only Auditor',
    category: 'Oversight',
    description: 'Read-only controlled access for external assurance or audit review.',
    permissions: unique(BASIC.filter(p => p !== 'ai.use'), VIEW_CORE, VIEW_ASSURANCE, ['audit.view'])
  }
];

export const SOD_CONFLICTS: Array<{
  left: BankRoleKey;
  right: BankRoleKey;
  reason: string;
}> = [
  {
    left: 'USER_ADMIN_MAKER',
    right: 'USER_ADMIN_APPROVER',
    reason: 'User access creation and approval must be performed by different users.'
  },
  {
    left: 'CONTROL_OWNER',
    right: 'ICOFR_TESTER',
    reason: 'A control owner cannot independently test the same control population.'
  },
  {
    left: 'ICOFR_PREPARER',
    right: 'ICOFR_REVIEWER',
    reason: 'ICOFR workpaper preparation and independent review must be segregated.'
  },
  {
    left: 'RCSA_ASSESSOR',
    right: 'RCSA_APPROVER',
    reason: 'RCSA/CSA assessment and approval must be segregated.'
  },
  {
    left: 'RISK_OWNER',
    right: 'INTERNAL_AUDIT',
    reason: 'Risk ownership is incompatible with independent internal-audit assurance.'
  },
  {
    left: 'PROCESS_OWNER',
    right: 'INTERNAL_AUDIT',
    reason: 'Process ownership is incompatible with independent internal-audit assurance.'
  },
  {
    left: 'CONTROL_OWNER',
    right: 'INTERNAL_AUDIT',
    reason: 'Control ownership is incompatible with independent internal-audit assurance.'
  }
];

export function roleDefinition(key: string) {
  return BANK_ROLE_CATALOG.find(role => role.key === key);
}

export function permissionsForRoles(roleKeys: string[]): PermissionKey[] {
  if (roleKeys.includes('PLATFORM_SUPER_ADMIN')) return ALL_PERMISSIONS;
  const permissions = roleKeys.flatMap(key => roleDefinition(key)?.permissions || []);
  return Array.from(new Set(permissions));
}

export function validateRoleSegregation(roleKeys: string[]) {
  const roleSet = new Set(roleKeys);
  return SOD_CONFLICTS.filter(rule => roleSet.has(rule.left) && roleSet.has(rule.right));
}

export function requiredPermissionForPage(pathname: string): PermissionKey | null {
  if (pathname === '/' || pathname.startsWith('/dashboard')) return 'dashboard.view';
  if (pathname.startsWith('/profile')) return 'profile.self';
  if (pathname.startsWith('/admin/users')) return 'user.view';
  if (pathname.startsWith('/admin/institutions')) return 'tenant.manage';
  if (pathname.startsWith('/admin/security')) return 'security.admin';
  if (pathname.startsWith('/onboarding')) return 'institution.manage';
  if (pathname.startsWith('/evidence')) return 'evidence.view';
  if (pathname.startsWith('/organization')) return 'organization.view';
  if (pathname.startsWith('/processes')) return 'process.view';
  if (pathname.startsWith('/risks')) return 'risk.view';
  if (pathname.startsWith('/controls')) return 'control.view';
  if (pathname.startsWith('/rcm')) return 'rcm.view';
  if (pathname.startsWith('/rcsa')) return 'rcsa.view';
  if (pathname.startsWith('/icofr')) return 'icofr.view';
  if (pathname.startsWith('/tod') || pathname.startsWith('/toe')) return 'icofr.test';
  if (pathname.startsWith('/remediation')) return 'remediation.view';
  if (pathname.startsWith('/health')) return 'control.view';
  if (pathname.startsWith('/ccm')) return 'ccm.view';
  if (pathname.startsWith('/certification')) return 'certification.view';
  if (pathname.startsWith('/calendar')) return 'calendar.view';
  if (pathname.startsWith('/tasks')) return 'task.view';
  if (pathname.startsWith('/reports')) return 'report.view';
  return null;
}

export function requiredPermissionForApi(pathname: string, method: string): PermissionKey | null {
  const write = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

  if (pathname.startsWith('/api/ai/')) return 'ai.use';
  if (pathname.startsWith('/api/onboarding')) return 'institution.manage';
  if (pathname.startsWith('/api/evidence')) return write ? 'evidence.manage' : 'evidence.view';
  if (pathname.startsWith('/api/organization')) return write ? 'organization.manage' : 'organization.view';
  if (pathname.startsWith('/api/processes')) return write ? 'process.edit' : 'process.view';
  if (pathname.startsWith('/api/risks')) return write ? 'risk.edit' : 'risk.view';
  if (pathname.startsWith('/api/controls')) return write ? 'control.edit' : 'control.view';
  if (pathname.startsWith('/api/rcm')) return write ? 'rcm.edit' : 'rcm.view';
  if (pathname.startsWith('/api/assurance')) return null;
  if (pathname.startsWith('/api/assure/toe')) return write ? 'icofr.test' : 'icofr.view';
  if (pathname.startsWith('/api/assure/remediation')) return write ? 'remediation.own' : 'remediation.view';
  if (pathname.startsWith('/api/monitor/ccm')) return write ? 'ccm.manage' : 'ccm.view';
  if (pathname.startsWith('/api/icofr/certification')) return write ? 'certification.sign' : 'certification.view';
  if (pathname.startsWith('/api/icofr/')) return write ? 'icofr.prepare' : 'icofr.view';
  if (pathname.startsWith('/api/dashboard')) return 'dashboard.view';
  return null;
}

export const PASSWORD_POLICY = {
  minLength: 12,
  maxLength: 128,
  historyDepth: 8,
  expiryDays: 90,
  maxFailedAttempts: 5,
  lockoutMinutes: 15,
  sessionMinutes: 60
} as const;

export function passwordPolicyErrors(password: string, username = '', email = '') {
  const errors: string[] = [];
  if (password.length < PASSWORD_POLICY.minLength) errors.push('Minimum 12 characters.');
  if (password.length > PASSWORD_POLICY.maxLength) errors.push('Maximum 128 characters.');
  if (!/[A-Z]/.test(password)) errors.push('At least one uppercase letter is required.');
  if (!/[a-z]/.test(password)) errors.push('At least one lowercase letter is required.');
  if (!/[0-9]/.test(password)) errors.push('At least one number is required.');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('At least one special character is required.');
  const normalized = password.toLowerCase();
  if (username && normalized.includes(username.toLowerCase())) errors.push('Password must not contain the username.');
  if (email) {
    const local = email.split('@')[0]?.toLowerCase();
    if (local && local.length >= 4 && normalized.includes(local)) errors.push('Password must not contain the email name.');
  }
  return errors;
}
