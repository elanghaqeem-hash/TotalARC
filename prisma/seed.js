const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Cleaning existing database tables ---');
  // Clear tables in reverse dependency order
  const tableNames = [
    'AuditLog', 'Task', 'RiskAcceptance', 'ManagementAttestation', 'ControlCertification',
    'CCMException', 'MonitoringRun', 'MonitoringRule', 'RetestRecord', 'MAPMilestone',
    'ManagementActionPlan', 'Issue', 'RootCauseAnalysis', 'ControlDeficiency',
    'TestingException', 'TestSample', 'ToETest', 'ToDTest', 'Walkthrough',
    'IPERegister', 'AccountAssertionMapping', 'FinancialAccount', 'CSAResponse',
    'AssessmentCampaign', 'ControlRiskMapping', 'ControlMaster', 'RiskMaster',
    'SIPOC', 'ProcessObjective', 'ProcessActivity', 'BusinessProcess', 'ProcessCategory',
    'SystemApplication', 'Regulation', 'Framework', 'User', 'OrganizationUnit',
    'LegalEntity', 'IndustryClassification', 'Institution'
  ];

  for (const table of tableNames) {
    try {
      await prisma[table.charAt(0).toLowerCase() + table.slice(1)].deleteMany({});
    } catch (e) {
      // ignore table empty
    }
  }

  console.log('--- Seeding Industry Classifications ---');
  const industries = [
    { industry: 'Technology', sector: 'IT Services', subsector: 'Digital Transformation & Managed Services' },
    { industry: 'Technology', sector: 'Software', subsector: 'SaaS & Cloud Platforms' },
    { industry: 'Technology', sector: 'Cybersecurity', subsector: 'Information Security Services' },
    { industry: 'Financial Services', sector: 'Commercial Banking', subsector: 'Corporate & Retail Banking' },
    { industry: 'Financial Services', sector: 'Insurance', subsector: 'Life & General Insurance' },
    { industry: 'Financial Services', sector: 'Fintech', subsector: 'Payment Gateway & E-Wallet' },
    { industry: 'Energy', sector: 'Power Generation', subsector: 'Renewable Energy & Solar' },
    { industry: 'Mining', sector: 'Mineral Processing', subsector: 'Nickel & Copper Smelting' },
    { industry: 'Manufacturing', sector: 'Electronics', subsector: 'Semiconductors & Components' },
    { industry: 'Manufacturing', sector: 'Pharmaceutical', subsector: 'Medicinal Formulation' },
    { industry: 'Telecommunications', sector: 'Telecom Operator', subsector: '5G Mobile & Fiber Optic' },
    { industry: 'Transportation & Logistics', sector: 'Supply Chain', subsector: 'Freight & Warehousing' },
    { industry: 'Healthcare', sector: 'Hospital', subsector: 'Tertiary Care & Diagnostics' },
    { industry: 'Retail & Consumer', sector: 'E-Commerce', subsector: 'Omnichannel Retail' },
    { industry: 'Property & Construction', sector: 'Property Developer', subsector: 'Commercial Real Estate' },
    { industry: 'Government & Public Sector', sector: 'Government Agency', subsector: 'Public Administration' },
    { industry: 'Professional Services', sector: 'Consulting', subsector: 'Audit & Advisory' }
  ];

  for (const ind of industries) {
    await prisma.industryClassification.create({ data: ind });
  }

  console.log('--- Seeding Governance Frameworks & Regulations ---');
  await prisma.framework.createMany({
    data: [
      { code: 'COSO-IC', name: 'COSO Internal Control - Integrated Framework', category: 'Internal Control', applicability: 'Applicable' },
      { code: 'COSO-ERM', name: 'COSO Enterprise Risk Management', category: 'Risk Management', applicability: 'Applicable' },
      { code: 'ISO-31000', name: 'ISO 31000:2018 Risk Management Guidelines', category: 'Risk Management', applicability: 'Applicable' },
      { code: 'ISO-27001', name: 'ISO/IEC 27001:2022 Information Security', category: 'Cybersecurity', applicability: 'Applicable' },
      { code: 'SOX-404', name: 'Sarbanes-Oxley Section 404 (ICOFR)', category: 'Financial Reporting', applicability: 'Applicable' },
      { code: 'COBIT-2019', name: 'COBIT 2019 Framework for IT Governance', category: 'IT Governance', applicability: 'Reference' },
      { code: 'NIST-CSF', name: 'NIST Cybersecurity Framework 2.0', category: 'Cybersecurity', applicability: 'Applicable' }
    ]
  });

  await prisma.regulation.createMany({
    data: [
      { regulator: 'OJK', code: 'POJK-13/POJK.03/2017', name: 'Penerapan Tata Kelola Bagi Bank Umum', jurisdiction: 'Indonesia', requirement: 'Implementasi 3 Lines of Defense dan Manajemen Risiko Terintegrasi', frequency: 'Quarterly' },
      { regulator: 'Bank Indonesia', code: 'PADG-23/2021', name: 'Penyelenggaraan Sistem Pembayaran', jurisdiction: 'Indonesia', requirement: 'Audit Kontrol IT dan Keamanan Transaksi Finansial', frequency: 'Annual' },
      { regulator: 'Kemenkominfo', code: 'UU-PDP-27/2022', name: 'Undang-Undang Perlindungan Data Pribadi', jurisdiction: 'Indonesia', requirement: 'Data Protection Officer & Security Controls', frequency: 'Annual' },
      { regulator: 'US SEC', code: 'SOX-ACT-2002', name: 'Sarbanes-Oxley Public Company Accounting Reform', jurisdiction: 'United States', requirement: 'Audited Internal Controls over Financial Reporting', frequency: 'Annual' }
    ]
  });

  console.log('--- Seeding Systems & Applications ---');
  await prisma.systemApplication.createMany({
    data: [
      { code: 'SYS-ERP', name: 'SAP S/4HANA Enterprise Cloud', type: 'ERP', cloudOnPrem: 'Cloud', criticality: 'Critical', systemOwner: 'Rian Wijaya (Head of Enterprise Apps)', vendor: 'SAP SE', dataClass: 'Restricted' },
      { code: 'SYS-BANK', name: 'Corporate Cash Management & Host-to-Host Banking API', type: 'Core', cloudOnPrem: 'Cloud', criticality: 'Critical', systemOwner: 'Accounts Payable Manager', vendor: 'Bank Partner', dataClass: 'Restricted' },
      { code: 'SYS-HRIS', name: 'Workday Human Capital Management', type: 'SaaS', cloudOnPrem: 'Cloud', criticality: 'High', systemOwner: 'VP HR', vendor: 'Workday Inc.', dataClass: 'Confidential' },
      { code: 'SYS-IAM', name: 'Microsoft Entra ID / Okta Privileged Access', type: 'SaaS', cloudOnPrem: 'Cloud', criticality: 'Critical', systemOwner: 'CISO / IT Sec', vendor: 'Microsoft', dataClass: 'Restricted' }
    ]
  });

  console.log('--- Seeding Process Categories ---');
  const catGov = await prisma.processCategory.create({ data: { code: 'CAT-GOV', name: 'Governance & Strategy', orderIndex: 1 } });
  const catCore = await prisma.processCategory.create({ data: { code: 'CAT-CORE', name: 'Core Business Operations', orderIndex: 2 } });
  const catFin = await prisma.processCategory.create({ data: { code: 'CAT-FIN', name: 'Finance & Treasury', orderIndex: 3 } });
  const catIT = await prisma.processCategory.create({ data: { code: 'CAT-IT', name: 'Information Technology & Cyber', orderIndex: 4 } });
  const catProc = await prisma.processCategory.create({ data: { code: 'CAT-PROC', name: 'Procurement & Vendor Management', orderIndex: 5 } });
  const catHR = await prisma.processCategory.create({ data: { code: 'CAT-HR', name: 'Human Resources & People', orderIndex: 6 } });

  console.log('--- Seeding Demo Institution: PT Nusantara Digital Services ---');
  const institution = await prisma.institution.create({
    data: {
      name: 'PT Nusantara Digital Services',
      legalName: 'PT Nusantara Digital Services Tbk',
      shortName: 'NDS',
      institutionType: 'Public Company',
      country: 'Indonesia',
      provinceState: 'DKI Jakarta',
      city: 'Jakarta Selatan',
      registeredAddress: 'Nusantara Cyber Tower, Lt. 28, Jl. Rasuna Said Kav. 62, Jakarta Selatan 12920',
      operationalAddress: 'Nusantara Cyber Tower, Lt. 25-28, Jakarta',
      website: 'https://www.nusantaradigital.id',
      generalEmail: 'assurance@nusantaradigital.id',
      telephone: '+62 21 5290 8800',
      yearEstablished: 2016,
      registrationNumber: 'AHU-0091823.AH.01.01.2016',
      taxId: '01.234.567.8-012.000',
      stockExchange: 'IDX',
      ticker: 'NDS.JK',
      employeeCount: '2,500 - 5,000 Employees',
      revenueRange: 'IDR 1 Trillion - IDR 5 Trillion',
      businessModel: 'B2B',
      operatingModel: 'Hybrid'
    }
  });

  const legalEntity = await prisma.legalEntity.create({
    data: {
      institutionId: institution.id,
      code: 'ENT-NDS-HQ',
      name: 'PT Nusantara Digital Services Tbk (Headquarters)',
      country: 'Indonesia',
      taxId: '01.234.567.8-012.000'
    }
  });

  // Organization Hierarchy
  const dirFinance = await prisma.organizationUnit.create({
    data: {
      institutionId: institution.id,
      legalEntityId: legalEntity.id,
      type: 'Directorate',
      code: 'DIR-FIN-OPS',
      name: 'Directorate of Finance, Operations & Risk',
      headName: 'Budi Santoso',
      headEmail: 'budi.santoso@nusantaradigital.id'
    }
  });

  const divProcTreasury = await prisma.organizationUnit.create({
    data: {
      institutionId: institution.id,
      legalEntityId: legalEntity.id,
      parentId: dirFinance.id,
      type: 'Division',
      code: 'DIV-TREASURY',
      name: 'Treasury & Accounts Payable Division',
      headName: 'Maya Indira',
      headEmail: 'maya.indira@nusantaradigital.id'
    }
  });

  const deptAP = await prisma.organizationUnit.create({
    data: {
      institutionId: institution.id,
      legalEntityId: legalEntity.id,
      parentId: divProcTreasury.id,
      type: 'Department',
      code: 'DEPT-AP',
      name: 'Accounts Payable & Payment Disbursement',
      headName: 'Rizky Ananda',
      headEmail: 'rizky.ananda@nusantaradigital.id'
    }
  });

  console.log('--- Seeding Platform Users (RBAC) ---');
  const userAdmin = await prisma.user.create({
    data: { institutionId: institution.id, name: 'Satria Pratama', email: 'satria.admin@nusantaradigital.id', role: 'Admin', department: 'GRC & Governance' }
  });
  const userProcOwner = await prisma.user.create({
    data: { institutionId: institution.id, name: 'Maya Indira', email: 'maya.indira@nusantaradigital.id', role: 'ProcessOwner', department: 'Treasury & AP' }
  });
  const userCtrlOwner = await prisma.user.create({
    data: { institutionId: institution.id, name: 'Rizky Ananda', email: 'rizky.ananda@nusantaradigital.id', role: 'ControlOwner', department: 'Accounts Payable' }
  });
  const userTester = await prisma.user.create({
    data: { institutionId: institution.id, name: 'Kevin Sanjaya', email: 'kevin.tester@nusantaradigital.id', role: 'Tester', department: 'Internal Control' }
  });
  const userReviewer = await prisma.user.create({
    data: { institutionId: institution.id, name: 'Dian Sastrowardoyo', email: 'dian.reviewer@nusantaradigital.id', role: 'Reviewer', department: 'Internal Audit & Assurance' }
  });
  const userExec = await prisma.user.create({
    data: { institutionId: institution.id, name: 'Budi Santoso', email: 'budi.cfo@nusantaradigital.id', role: 'Executive', department: 'Board of Directors' }
  });

  console.log('--- Seeding 7 Standard Processes ---');
  // Process 1: Procure to Pay (The Deep End-to-End Scenario)
  const procP2P = await prisma.businessProcess.create({
    data: {
      institutionId: institution.id,
      legalEntityId: legalEntity.id,
      orgUnitId: deptAP.id,
      categoryId: catFin.id,
      processId: 'PRC-P2P-001',
      name: 'Procure to Pay',
      level: 2,
      description: 'End-to-end purchasing, 3-way invoice matching, approval verification, and electronic payment disbursement to corporate suppliers and service providers.',
      ownerName: 'Maya Indira',
      ownerEmail: 'maya.indira@nusantaradigital.id',
      managerName: 'Rizky Ananda',
      criticality: 'Critical',
      classification: 'Core',
      isIcofrRelevant: true,
      status: 'Approved',
      version: '1.0',
      tags: 'ICOFR, SOX-404, Payments, Dual-Approval, High-Risk'
    }
  });

  // Supporting Processes from Section 135
  const otherProcesses = [
    { code: 'PRC-O2C-001', name: 'Order to Cash', catId: catFin.id, owner: 'Denny Malik', crit: 'Critical', icofr: true },
    { code: 'PRC-H2R-001', name: 'Hire to Retire', catId: catHR.id, owner: 'Rina Kusuma', crit: 'High', icofr: false },
    { code: 'PRC-FNC-001', name: 'Financial Closing & Reporting', catId: catFin.id, owner: 'Maya Indira', crit: 'Critical', icofr: true },
    { code: 'PRC-UAM-001', name: 'User Access Management', catId: catIT.id, owner: 'Fajar Nugroho', crit: 'Critical', icofr: true },
    { code: 'PRC-VM-001', name: 'Vendor Management & Due Diligence', catId: catProc.id, owner: 'Surya Saputra', crit: 'High', icofr: false },
    { code: 'PRC-INC-001', name: 'Security Incident Management', catId: catIT.id, owner: 'Fajar Nugroho', crit: 'Critical', icofr: false }
  ];

  for (const p of otherProcesses) {
    await prisma.businessProcess.create({
      data: {
        institutionId: institution.id,
        legalEntityId: legalEntity.id,
        orgUnitId: divProcTreasury.id,
        categoryId: p.catId,
        processId: p.code,
        name: p.name,
        level: 2,
        ownerName: p.owner,
        criticality: p.crit,
        classification: 'Core',
        isIcofrRelevant: p.icofr,
        status: 'Approved',
        version: '1.0'
      }
    });
  }

  console.log('--- Seeding P2P Process Objectives & SIPOC ---');
  await prisma.processObjective.create({
    data: {
      processId: procP2P.id,
      objective: 'Ensure payments are valid, complete, accurate, appropriately authorized, and executed in accordance with treasury limits.',
      strategicGoal: 'Safeguard corporate liquidity, ensure financial statement accuracy, and prevent unauthorized disbursements.',
      expectedOutcome: '100% of disbursements backed by valid approved purchase orders, receiving documentation, and dual-authorized execution.',
      kpi: 'Disbursement Accuracy Rate >= 99.9%',
      kri: 'Zero unauthorized payment transactions',
      sla: 'Payment released within 3 business days of verified 3-way match'
    }
  });

  await prisma.sIPOC.create({
    data: {
      processId: procP2P.id,
      suppliers: 'Verified Vendors, Service Providers, Supply Chain Logistics Partners',
      inputs: 'Purchase Orders (PO), Goods/Service Receipt Notes (GRN), Commercial Tax Invoices, Bank Details',
      processSteps: '1. Invoice Ingestion & Verification -> 2. Automated 3-Way Match in SAP -> 3. Payment Batch Generation -> 4. Dual Electronic Approval -> 5. Bank Release & GL Posting',
      outputs: 'Approved Payment Batch, Bank Debit Advice, Vendor Remittance Advice, SAP Financial Postings',
      customers: 'Corporate Suppliers, General Ledger Accounting, Treasury, Tax Department'
    }
  });

  console.log('--- Seeding P2P Activities ---');
  const act1 = await prisma.processActivity.create({
    data: {
      processId: procP2P.id,
      activityId: 'ACT-P2P-001',
      name: 'Vendor Tax Invoice Ingestion & Validation',
      nature: 'Hybrid',
      performer: 'Accounts Payable Clerk',
      systemUsed: 'SAP S/4HANA & OCR Invoice Portal',
      orderIndex: 1
    }
  });

  const act2 = await prisma.processActivity.create({
    data: {
      processId: procP2P.id,
      activityId: 'ACT-P2P-002',
      name: 'Three-Way Match Verification (PO vs GRN vs Invoice)',
      nature: 'Automated',
      performer: 'SAP S/4HANA System Engine',
      systemUsed: 'SAP S/4HANA ERP',
      orderIndex: 2
    }
  });

  const act3 = await prisma.processActivity.create({
    data: {
      processId: procP2P.id,
      activityId: 'ACT-P2P-003',
      name: 'Payment Batch Proposal Generation',
      nature: 'IT Dependent Manual',
      performer: 'Treasury Officer',
      systemUsed: 'SAP S/4HANA Treasury Module',
      orderIndex: 3
    }
  });

  const act4 = await prisma.processActivity.create({
    data: {
      processId: procP2P.id,
      activityId: 'ACT-P2P-004',
      name: 'High-Value Payment Authorization & Release',
      nature: 'IT Dependent Manual',
      performer: 'AP Manager (Signatory 1) & Finance Director (Signatory 2)',
      systemUsed: 'SAP S/4HANA & Host-to-Host Corporate Banking',
      orderIndex: 4
    }
  });

  const act5 = await prisma.processActivity.create({
    data: {
      processId: procP2P.id,
      activityId: 'ACT-P2P-005',
      name: 'Daily Bank Reconciliation & Clearing',
      nature: 'Automated',
      performer: 'Treasury Analyst & SAP Auto-Recon Engine',
      systemUsed: 'SAP S/4HANA & Core Banking Feeds',
      orderIndex: 5
    }
  });

  console.log('--- Seeding P2P Risk: Unauthorized Payment ---');
  const riskP2P = await prisma.riskMaster.create({
    data: {
      institutionId: institution.id,
      processId: procP2P.id,
      activityId: act4.id,
      riskId: 'RSK-P2P-001',
      name: 'Unauthorized Payment Disbursement',
      description: 'Due to incomplete approval workflow or outdated ERP authority matrix, there is a risk that unauthorized, inaccurate, or duplicate payments are executed, resulting in direct financial loss and inaccurate financial reporting.',
      cause: 'Incomplete approval workflow, outdated authorization matrix in ERP, or unauthorized override of approval thresholds.',
      event: 'Payment disbursement executed without required dual management authorization or to unverified beneficiary accounts.',
      impact: 'Direct corporate financial loss, cash leakage, restatement of payables in financial statements, and regulatory sanction.',
      category: 'Financial Reporting',
      ownerName: 'Maya Indira (VP Finance & Operations)',
      inherentLikelihood: 4,
      inherentImpact: 4,
      inherentScore: 16,
      inherentRating: 'Critical',
      residualLikelihood: 2,
      residualImpact: 3,
      residualScore: 6,
      residualRating: 'Medium',
      riskTreatment: 'Reduce',
      status: 'Active',
      version: '1.0'
    }
  });

  // Additional risks for rich enterprise experience
  await prisma.riskMaster.create({
    data: {
      institutionId: institution.id,
      processId: procP2P.id,
      activityId: act2.id,
      riskId: 'RSK-P2P-002',
      name: 'Fictitious or Duplicate Vendor Invoicing',
      description: 'Due to lack of automated invoice matching and duplicate checks, duplicate or fictitious supplier invoices are processed, leading to duplicate disbursements.',
      cause: 'Manual invoice entry without duplicate tax invoice / PO validation.',
      event: 'Duplicate payment release to supplier.',
      impact: 'Cash leakage and recovery disputes.',
      category: 'Operational',
      ownerName: 'Rizky Ananda',
      inherentLikelihood: 3,
      inherentImpact: 4,
      inherentScore: 12,
      inherentRating: 'High',
      residualLikelihood: 1,
      residualImpact: 2,
      residualScore: 2,
      residualRating: 'Low',
      riskTreatment: 'Reduce'
    }
  });

  console.log('--- Seeding Control: Payments Dual Authorization (CTRL-P2P-001) ---');
  const ctrlP2P = await prisma.controlMaster.create({
    data: {
      institutionId: institution.id,
      processId: procP2P.id,
      activityId: act4.id,
      controlId: 'CTRL-P2P-001',
      name: 'Dual Authorization on Disbursements Exceeding Policy Thresholds',
      description: 'Disbursements exceeding predefined limit (IDR 100,000,000 / USD 10,000) require mandatory electronic dual-authorization by authorized signatories (Level 1: AP Manager and Level 2: Finance Director / CFO) within the ERP workflow prior to host-to-host bank file release.',
      objective: 'Prevent unauthorized or fraudulent payments by enforcing strict dual segregation of duties and approval thresholds.',
      controlOwner: 'Rizky Ananda (Manager Accounts Payable)',
      performer: 'AP Manager & Finance Director',
      reviewer: 'Dian Sastrowardoyo (Head of Internal Control & Assurance)',
      type: 'Preventive',
      nature: 'IT Dependent Manual',
      method: 'Authorization',
      frequency: 'Per Transaction',
      isKeyControl: true,
      keyControlRationale: 'Direct mitigation against high-value fraudulent payment releases; essential SOX-404 and ICOFR financial statement control.',
      isIcofrKey: true,
      isItgc: false,
      evidenceRequirement: 'SAP Workflow Approval Log showing dual digital signatures and bank batch release confirmation audit trail.',
      systemDependency: 'SAP S/4HANA Treasury & Host-to-Host Banking API',
      frameworkMapping: 'COSO IC Princ. 10 (Control Activities), SOX 404 Assertions: Occurrence & Accuracy, ISO 27001 A.9',
      regulationMapping: 'POJK 13/2017 Art. 12, Bank Indonesia PADG 23/2021',
      designAssessment: 'Effective',
      operatingStatus: 'Effective', // Now effective after remediation & retest!
      overallHealth: 'Healthy',
      healthRationale: 'Design verified effective. Historical ToE exception (2/25 failed) was fully remediated via MAP-2026-001, passed independent retesting (10/10), and is now under continuous real-time monitoring with zero violations.',
      version: '1.0',
      status: 'Active'
    }
  });

  // Link Control to Risk
  await prisma.controlRiskMapping.create({
    data: {
      controlId: ctrlP2P.id,
      riskId: riskP2P.id
    }
  });

  // Additional Control for rich demo
  const ctrlP2P2 = await prisma.controlMaster.create({
    data: {
      institutionId: institution.id,
      processId: procP2P.id,
      activityId: act2.id,
      controlId: 'CTRL-P2P-002',
      name: 'Automated 3-Way Invoice Matching and Duplicate Check',
      description: 'SAP S/4HANA automatically enforces a 3-way match between PO, Goods Receipt, and Vendor Invoice with strict price tolerance <= 0.5% and duplicate invoice number validation.',
      objective: 'Ensure only verified goods and services delivered at agreed contract prices are processed for payment.',
      controlOwner: 'Rizky Ananda',
      type: 'Preventive',
      nature: 'Automated',
      method: 'Automated Validation',
      frequency: 'Real Time',
      isKeyControl: true,
      isIcofrKey: true,
      designAssessment: 'Effective',
      operatingStatus: 'Effective',
      overallHealth: 'Healthy',
      healthRationale: 'Automated system logic validated; zero tolerance bypass permitted.'
    }
  });

  console.log('--- Seeding RCSA Campaign & CSA Assessment ---');
  const campaign = await prisma.assessmentCampaign.create({
    data: {
      institutionId: institution.id,
      name: 'FY2026 Annual Risk & Control Self-Assessment (RCSA)',
      type: 'RCSA',
      period: '2026-Q3',
      startDate: new Date('2026-07-01'),
      dueDate: new Date('2026-09-30'),
      status: 'In Progress',
      ownerName: 'Dian Sastrowardoyo',
      approverName: 'Budi Santoso'
    }
  });

  await prisma.cSAResponse.create({
    data: {
      campaignId: campaign.id,
      controlId: ctrlP2P.id,
      wasPerformed: true,
      frequencyMet: true,
      evidenceAttached: true,
      exceptionsFound: false,
      exceptionCount: 0,
      processChanged: false,
      controlChanged: false,
      csaConclusion: 'Effective',
      assessorNotes: 'Control performed for all processed batches. Evidence available in SAP workflow repository.',
      assessorName: 'Rizky Ananda (Control Owner)'
    }
  });

  console.log('--- Seeding ICOFR Scoping & Assertions ---');
  const accAP = await prisma.financialAccount.create({
    data: {
      accountCode: '2110-001',
      accountName: 'Trade Accounts Payable & Accrued Expenses',
      financialStatement: 'Balance Sheet',
      balanceAmount: 485000000000, // IDR 485 Billion
      isSignificant: true,
      scopingRationale: 'Account balance exceeds quantitative planning materiality (IDR 25B) by 19.4x. Core operational disbursement account.',
      fraudExposure: 'High',
      complexity: 'Medium'
    }
  });

  await prisma.accountAssertionMapping.createMany({
    data: [
      { accountId: accAP.id, assertion: 'Existence', isInScope: true },
      { accountId: accAP.id, assertion: 'Occurrence', isInScope: true },
      { accountId: accAP.id, assertion: 'Completeness', isInScope: true },
      { accountId: accAP.id, assertion: 'Accuracy', isInScope: true },
      { accountId: accAP.id, assertion: 'Cut-off', isInScope: true }
    ]
  });

  await prisma.iPERegister.create({
    data: {
      reportName: 'ZFI_DISB_RUN_REPORT (Disbursement Run Audit Register)',
      systemSource: 'SAP S/4HANA ERP Module FI-AP',
      reportOwner: 'IT Enterprise Applications Team',
      parameters: 'Company Code = 1000, Fiscal Year = 2026, Run Date range',
      logicSummary: 'Extracts all cleared vendor payment proposal batches with approver user ID, timestamp, and amount.',
      completenessTested: true,
      accuracyTested: true,
      evidenceDoc: 'DOC-IPE-SAP-001.pdf'
    }
  });

  console.log('--- Seeding Walkthrough & Test of Design (ToD) ---');
  await prisma.walkthrough.create({
    data: {
      controlId: ctrlP2P.id,
      participants: 'Kevin Sanjaya (Tester), Rizky Ananda (AP Manager), Fajar Nugroho (SAP Basis)',
      transactionRef: 'TRX-WT-2026-004',
      systemsInspected: 'SAP S/4HANA Workflow Engine & Banking Gateway',
      observations: 'Walkthrough confirmed that SAP workflow routes batches > IDR 100M to secondary signatory queue as designed.',
      processChanged: false,
      conclusion: 'Walkthrough Satisfactory - Design criteria confirmed'
    }
  });

  await prisma.toDTest.create({
    data: {
      testId: 'TOD-P2P-001',
      controlId: ctrlP2P.id,
      processId: procP2P.id,
      riskId: riskP2P.id,
      testerName: 'Kevin Sanjaya (Internal Control Specialist)',
      reviewerName: 'Dian Sastrowardoyo (Assurance Lead)',
      period: '2026-Annual',
      testObjective: 'Evaluate whether the design of dual electronic authorization adequately mitigates the risk of unauthorized disbursements above IDR 100M.',
      objectiveAlignment: true,
      riskCoverage: true,
      precisionAdequate: true,
      segregationDuties: true,
      evidenceSufficiency: true,
      observations: 'Control design incorporates clear dollar thresholds, automated routing, and segregation between creation and approval roles.',
      conclusion: 'Effective Design',
      status: 'Approved'
    }
  });

  console.log('--- Seeding Test of Operating Effectiveness (ToE) ---');
  const toeTest = await prisma.toETest.create({
    data: {
      testId: 'TOE-P2P-001',
      controlId: ctrlP2P.id,
      processId: procP2P.id,
      riskId: riskP2P.id,
      testerName: 'Kevin Sanjaya',
      reviewerName: 'Dian Sastrowardoyo',
      period: '2026-Annual',
      populationSize: 450,
      populationSource: 'SAP S/4HANA Payment Proposal Batch Ledger (Q1-Q2 2026)',
      samplingMethod: 'Risk-Based Sampling',
      sampleSize: 25,
      passCount: 23,
      failCount: 2,
      testerConclusion: 'Partially Effective',
      finalConclusion: 'Partially Effective',
      status: 'Completed',
      notes: 'Out of 25 sampled payment transactions exceeding IDR 100M, 23 passed with full dual authorization audit trails. However, 2 transactions were released with single approval due to an outdated user role delegation profile.'
    }
  });

  // Seed 25 Samples
  for (let i = 1; i <= 25; i++) {
    const isException = (i === 12 || i === 19);
    await prisma.testSample.create({
      data: {
        toeTestId: toeTest.id,
        sampleNumber: i,
        transactionRef: `TRX-2026-08${i < 10 ? '0' + i : i}`,
        transactionDate: new Date(2026, 3, i),
        amount: isException ? (i === 12 ? 350000000 : 180000000) : (120000000 + i * 8500000),
        attributesTested: 'Dual Authorization Verified, Threshold Verification, Role Segregation Checked',
        result: isException ? 'Fail' : 'Pass',
        failureReason: isException ? (i === 12 ? 'Payment of IDR 350M released with only single signatory approval.' : 'Payment of IDR 180M released without mandatory secondary sign-off.') : null,
        evidenceRef: `SAP-AUDIT-BATCH-${1000 + i}.pdf`
      }
    });
  }

  console.log('--- Seeding Exceptions & Deficiency ---');
  const exp1 = await prisma.testingException.create({
    data: {
      toeTestId: toeTest.id,
      exceptionNumber: 'EXP-2026-001',
      sampleRef: 'TRX-2026-0812',
      description: 'Transaction TRX-2026-0812 for IDR 350,000,000 was executed without mandatory secondary authorization due to ERP delegation rule glitch.',
      severity: 'High',
      status: 'Confirmed Exception'
    }
  });

  const exp2 = await prisma.testingException.create({
    data: {
      toeTestId: toeTest.id,
      exceptionNumber: 'EXP-2026-002',
      sampleRef: 'TRX-2026-0819',
      description: 'Transaction TRX-2026-0819 for IDR 180,000,000 bypassed secondary approval queue following organizational division restructuring.',
      severity: 'High',
      status: 'Confirmed Exception'
    }
  });

  const deficiency = await prisma.controlDeficiency.create({
    data: {
      exceptionId: exp1.id,
      deficiencyId: 'DEF-2026-001',
      title: 'Disbursement Dual Authorization Exception on High-Value ERP Payments',
      description: 'Two high-value payments exceeding IDR 100M were released without verified dual authorization due to unmaintained delegation matrices.',
      classification: 'Control Deficiency',
      financialImpact: 530000000, // IDR 530 Million
      regulatoryImpact: 'POJK 13/2017 Governance Observation; requires prompt remediation prior to external audit.',
      compensatingControls: 'Bank daily statement reconciliation (CTRL-P2P-005) detected payments ex-post with no fraudulent beneficiary identified.',
      humanApproved: true,
      approvedBy: 'Dian Sastrowardoyo (Head of Assurance)'
    }
  });

  console.log('--- Seeding Root Cause Analysis (5 Why) ---');
  await prisma.rootCauseAnalysis.create({
    data: {
      deficiencyId: deficiency.id,
      method: '5 Why',
      why1: 'Why did the payments release with single approval? Because the secondary approval step was automatically bypassed in SAP workflow.',
      why2: 'Why was it bypassed? Because the workflow routing matrix had no active secondary approver mapped for Division Treasury Unit 2.',
      why3: 'Why was no approver mapped? Because organizational restructuring moved department codes two months ago.',
      why4: 'Why was the ERP matrix not updated? Because IT Enterprise Apps team was not notified by HR/Finance change management.',
      why5: 'Why was there no notification? Because there was no periodic reconciliation or formal handover protocol between HR restructuring and ERP authorization matrices.',
      category: 'Process',
      rootCauseStatement: 'ERP authorization matrix had not been updated following organizational changes, lacking a recurring periodic governance review.'
    }
  });

  console.log('--- Seeding Issue & Management Action Plan (MAP) ---');
  const issue = await prisma.issue.create({
    data: {
      institutionId: institution.id,
      issueId: 'ISS-2026-001',
      source: 'TOE',
      processId: procP2P.id,
      riskId: riskP2P.id,
      controlId: ctrlP2P.id,
      deficiencyId: deficiency.id,
      title: 'ERP Dual Authorization Bypass on High-Value Disbursements',
      description: 'Control testing identified 2 exceptions where transactions > IDR 100M released without dual sign-off due to stale ERP authorization tables.',
      severity: 'High',
      ownerName: 'Maya Indira (VP Finance & Operations)',
      targetDate: new Date('2026-08-31'),
      status: 'Closed' // Closed following retesting!
    }
  });

  const mapAction = await prisma.managementActionPlan.create({
    data: {
      mapId: 'MAP-2026-001',
      issueId: issue.id,
      agreedAction: 'Update ERP approval authority matrix, implement automated workflow fallbacks, and introduce mandatory quarterly authorization reviews.',
      recommendation: 'Establish formal automated sync between HR departmental structure and SAP approval hierarchy, supplemented with quarterly access & limit reviews.',
      actionOwner: 'Rizky Ananda (AP Manager) & Fajar Nugroho (ERP Lead)',
      approverName: 'Budi Santoso (CFO)',
      originalDueDate: new Date('2026-08-31'),
      revisedDueDate: null,
      extensionCount: 0,
      progressPercent: 100,
      status: 'Closed',
      completedAt: new Date('2026-08-25')
    }
  });

  await prisma.mAPMilestone.createMany({
    data: [
      { mapId: mapAction.id, title: 'Cleanse and reconfigure SAP S/4HANA Dual Authorization Matrix', owner: 'Fajar Nugroho', dueDate: new Date('2026-08-10'), status: 'Completed', progressPercent: 100, evidenceDoc: 'SAP_CONFIG_CHANGE_CR4491.pdf' },
      { mapId: mapAction.id, title: 'Re-train all Tier 1 & Tier 2 Signatories on mobile token sign-off', owner: 'Rizky Ananda', dueDate: new Date('2026-08-18'), status: 'Completed', progressPercent: 100, evidenceDoc: 'TRAINING_ATTENDANCE_AUG2026.pdf' },
      { mapId: mapAction.id, title: 'Establish mandatory Quarterly Authorization Matrix Review SOP', owner: 'Maya Indira', dueDate: new Date('2026-08-25'), status: 'Completed', progressPercent: 100, evidenceDoc: 'SOP_FIN_AUTH_V2.pdf' }
    ]
  });

  console.log('--- Seeding Independent Retesting (Passed & Closed) ---');
  await prisma.retestRecord.create({
    data: {
      mapId: mapAction.id,
      retestId: 'RET-2026-001',
      sampleCount: 10,
      passedCount: 10,
      failedCount: 0,
      testerName: 'Kevin Sanjaya (Independent Tester)',
      reviewerName: 'Dian Sastrowardoyo (Assurance Lead)',
      result: 'Passed',
      conclusionNotes: 'Tested 10 post-remediation transactions exceeding IDR 100M from August 2026 payment runs. All 10 transactions strictly adhered to dual electronic sign-off. Matrix update verified effective.',
      retestedAt: new Date('2026-08-28')
    }
  });

  console.log('--- Seeding Continuous Control Monitoring (CCM) ---');
  const ccmRule = await prisma.monitoringRule.create({
    data: {
      ruleId: 'CCM-RULE-P2P-001',
      controlId: ctrlP2P.id,
      name: 'Detect High-Value Disbursements Exceeding Approval Limit or Single Sign-off',
      description: 'Continuous real-time query on SAP payment tables checking for transactions > IDR 100,000,000 with fewer than 2 distinct authorized approver IDs.',
      dataSource: 'SAP S/4HANA ERP & Banking Gateway API',
      queryLogic: 'SELECT * FROM BKPF_PAYMENT WHERE AMOUNT > 100000000 AND APPROVAL_COUNT < 2',
      frequency: 'Real Time',
      threshold: '0 Exceptions Allowed',
      status: 'Active',
      lastRunDate: new Date(),
      lastStatus: 'Healthy'
    }
  });

  const ccmRun = await prisma.monitoringRun.create({
    data: {
      ruleId: ccmRule.id,
      runTimestamp: new Date(),
      populationChecked: 120,
      exceptionsFound: 0,
      status: 'Healthy',
      details: 'Evaluated 120 payment batches processed over the last 7 calendar days. 100% compliant with dual approval.'
    }
  });

  console.log('--- Seeding Certification & Management Attestation ---');
  await prisma.controlCertification.create({
    data: {
      controlId: ctrlP2P.id,
      period: '2026-Annual',
      declarationText: 'I hereby certify that CTRL-P2P-001 was operated in accordance with established policies. Operating deficiency DEF-2026-001 was fully remediated via MAP-2026-001 and successfully retested.',
      certifierName: 'Rizky Ananda',
      certifierRole: 'Control Owner (Accounts Payable Manager)',
      status: 'Certified',
      certifiedAt: new Date('2026-09-01')
    }
  });

  await prisma.managementAttestation.create({
    data: {
      institutionId: institution.id,
      period: '2026-Annual',
      scopeSummary: 'Executive evaluation of internal control over financial reporting for PT Nusantara Digital Services Tbk across all significant business cycles.',
      cfoSignOff: true,
      cfoName: 'Budi Santoso, Chief Financial Officer',
      croSignOff: true,
      croName: 'Dewi Lestari, Chief Risk Officer',
      overallOpinion: 'Management concludes that Internal Control over Financial Reporting is ADEQUATE & EFFECTIVE as of September 2026, with identified deficiencies systematically remediated and validated.',
      attestedAt: new Date('2026-09-15')
    }
  });

  console.log('--- Seeding Tasks & Audit Trail ---');
  await prisma.task.createMany({
    data: [
      { userId: userAdmin.id, title: 'Quarterly Risk & Control Matrix Review (Q3 2026)', type: 'Review', dueDate: new Date('2026-09-30'), priority: 'High', status: 'In Progress', entityRef: 'PRC-P2P-001', link: '/rcm' },
      { userId: userTester.id, title: 'Perform ToE Testing on User Access Management (PRC-UAM-001)', type: 'TOE', dueDate: new Date('2026-10-15'), priority: 'Medium', status: 'Pending', entityRef: 'PRC-UAM-001', link: '/toe' },
      { userId: userCtrlOwner.id, title: 'Complete Control Self-Assessment for Q4 2026 Cycle', type: 'CSA', dueDate: new Date('2026-11-01'), priority: 'Medium', status: 'Pending', entityRef: 'CTRL-P2P-001', link: '/csa' }
    ]
  });

  await prisma.auditLog.createMany({
    data: [
      { institutionId: institution.id, userName: 'Satria Pratama', userRole: 'Admin', action: 'CREATE', entityType: 'Institution', recordId: institution.id, reason: 'Registered PT Nusantara Digital Services' },
      { institutionId: institution.id, userName: 'Maya Indira', userRole: 'ProcessOwner', action: 'APPROVE', entityType: 'Process', recordId: procP2P.id, reason: 'Published Procure to Pay v1.0' },
      { institutionId: institution.id, userName: 'Kevin Sanjaya', userRole: 'Tester', action: 'TEST_COMPLETE', entityType: 'ToE', recordId: toeTest.id, reason: 'Completed ToE testing: 23 passed, 2 exceptions' },
      { institutionId: institution.id, userName: 'Kevin Sanjaya', userRole: 'Tester', action: 'RETEST_PASS', entityType: 'MAP', recordId: mapAction.id, reason: 'Independent retest RET-2026-001 passed (10/10 samples)' },
      { institutionId: institution.id, userName: 'Dian Sastrowardoyo', userRole: 'Reviewer', action: 'CLOSE', entityType: 'Issue', recordId: issue.id, reason: 'Formally closed issue ISS-2026-001 following successful retest' }
    ]
  });

  console.log('--- DATABASE SEEDING COMPLETED SUCCESSFULLY! ---');
}

main()
  .catch(e => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
