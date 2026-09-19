-- Total ARC initial Cloudflare D1 schema.
-- Generated from prisma/schema.prisma; do not hand-edit model structure here.
-- CREATE statements are idempotent to support databases created during the
-- early D1 proof-of-concept without inserting any operational records.
-- CreateTable
CREATE TABLE IF NOT EXISTS "Institution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "institutionType" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Indonesia',
    "provinceState" TEXT,
    "city" TEXT,
    "registeredAddress" TEXT,
    "operationalAddress" TEXT,
    "website" TEXT,
    "generalEmail" TEXT,
    "telephone" TEXT,
    "yearEstablished" INTEGER,
    "registrationNumber" TEXT,
    "taxId" TEXT,
    "parentCompany" TEXT,
    "holdingCompany" TEXT,
    "stockExchange" TEXT,
    "ticker" TEXT,
    "logo" TEXT,
    "employeeCount" TEXT,
    "revenueRange" TEXT,
    "businessModel" TEXT,
    "operatingModel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IndustryClassification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "industry" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "subsector" TEXT NOT NULL,
    "code" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LegalEntity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Indonesia',
    "taxId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LegalEntity_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrganizationUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT NOT NULL,
    "legalEntityId" TEXT,
    "parentId" TEXT,
    "type" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headName" TEXT,
    "headEmail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrganizationUnit_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrganizationUnit_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrganizationUnit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "OrganizationUnit" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "department" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Framework" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "applicability" TEXT NOT NULL DEFAULT 'Applicable',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Regulation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "regulator" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT 'Indonesia',
    "requirement" TEXT,
    "frequency" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SystemApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cloudOnPrem" TEXT NOT NULL DEFAULT 'Cloud',
    "criticality" TEXT NOT NULL,
    "systemOwner" TEXT,
    "vendor" TEXT,
    "dataClass" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProcessCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BusinessProcess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT NOT NULL,
    "legalEntityId" TEXT,
    "orgUnitId" TEXT,
    "categoryId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 2,
    "parentProcessId" TEXT,
    "description" TEXT,
    "ownerName" TEXT NOT NULL,
    "ownerEmail" TEXT,
    "managerName" TEXT,
    "criticality" TEXT NOT NULL DEFAULT 'Critical',
    "classification" TEXT NOT NULL DEFAULT 'Core',
    "isIcofrRelevant" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "version" TEXT NOT NULL DEFAULT '1.0',
    "effectiveDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewDate" DATETIME,
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BusinessProcess_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BusinessProcess_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BusinessProcess_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrganizationUnit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BusinessProcess_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProcessCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BusinessProcess_parentProcessId_fkey" FOREIGN KEY ("parentProcessId") REFERENCES "BusinessProcess" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProcessActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "processId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "performer" TEXT,
    "nature" TEXT NOT NULL DEFAULT 'Manual',
    "frequency" TEXT NOT NULL DEFAULT 'Per Transaction',
    "inputData" TEXT,
    "outputData" TEXT,
    "systemUsed" TEXT,
    "sla" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessActivity_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BusinessProcess" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProcessObjective" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "processId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "strategicGoal" TEXT,
    "expectedOutcome" TEXT,
    "kpi" TEXT,
    "kri" TEXT,
    "sla" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessObjective_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BusinessProcess" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SIPOC" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "processId" TEXT NOT NULL,
    "suppliers" TEXT,
    "inputs" TEXT,
    "processSteps" TEXT,
    "outputs" TEXT,
    "customers" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SIPOC_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BusinessProcess" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RiskMaster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "activityId" TEXT,
    "riskId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "inherentLikelihood" INTEGER NOT NULL,
    "inherentImpact" INTEGER NOT NULL,
    "inherentScore" INTEGER NOT NULL,
    "inherentRating" TEXT NOT NULL,
    "residualLikelihood" INTEGER NOT NULL,
    "residualImpact" INTEGER NOT NULL,
    "residualScore" INTEGER NOT NULL,
    "residualRating" TEXT NOT NULL,
    "riskTreatment" TEXT NOT NULL DEFAULT 'Not Assessed',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "version" TEXT NOT NULL DEFAULT '1.0',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RiskMaster_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RiskMaster_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BusinessProcess" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RiskMaster_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ProcessActivity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ControlMaster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "activityId" TEXT,
    "controlId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "controlOwner" TEXT NOT NULL,
    "performer" TEXT,
    "reviewer" TEXT,
    "type" TEXT NOT NULL DEFAULT 'Preventive',
    "nature" TEXT NOT NULL DEFAULT 'IT Dependent Manual',
    "method" TEXT NOT NULL DEFAULT 'Approval',
    "frequency" TEXT NOT NULL DEFAULT 'Per Transaction',
    "isKeyControl" BOOLEAN NOT NULL DEFAULT false,
    "keyControlRationale" TEXT,
    "isIcofrKey" BOOLEAN NOT NULL DEFAULT false,
    "isItgc" BOOLEAN NOT NULL DEFAULT false,
    "evidenceRequirement" TEXT,
    "systemDependency" TEXT,
    "frameworkMapping" TEXT,
    "regulationMapping" TEXT,
    "designAssessment" TEXT NOT NULL DEFAULT 'Not Assessed',
    "operatingStatus" TEXT NOT NULL DEFAULT 'Not Assessed',
    "overallHealth" TEXT NOT NULL DEFAULT 'Not Assessed',
    "healthRationale" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ControlMaster_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ControlMaster_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BusinessProcess" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ControlMaster_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ProcessActivity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ControlRiskMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "controlId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ControlRiskMapping_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ControlMaster" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ControlRiskMapping_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "RiskMaster" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssessmentCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'RCSA',
    "period" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "ownerName" TEXT NOT NULL,
    "approverName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssessmentCampaign_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CSAResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "wasPerformed" BOOLEAN NOT NULL DEFAULT false,
    "frequencyMet" BOOLEAN NOT NULL DEFAULT false,
    "evidenceAttached" BOOLEAN NOT NULL DEFAULT false,
    "exceptionsFound" BOOLEAN NOT NULL DEFAULT false,
    "exceptionCount" INTEGER NOT NULL DEFAULT 0,
    "processChanged" BOOLEAN NOT NULL DEFAULT false,
    "controlChanged" BOOLEAN NOT NULL DEFAULT false,
    "csaConclusion" TEXT NOT NULL DEFAULT 'Not Performed',
    "assessorNotes" TEXT,
    "assessorName" TEXT NOT NULL,
    "assessedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CSAResponse_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AssessmentCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CSAResponse_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ControlMaster" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FinancialAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "financialStatement" TEXT NOT NULL,
    "balanceAmount" REAL NOT NULL DEFAULT 0,
    "isSignificant" BOOLEAN NOT NULL DEFAULT false,
    "scopingRationale" TEXT,
    "fraudExposure" TEXT NOT NULL DEFAULT 'Not Assessed',
    "complexity" TEXT NOT NULL DEFAULT 'Not Assessed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccountAssertionMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "assertion" TEXT NOT NULL,
    "isInScope" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountAssertionMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IPERegister" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportName" TEXT NOT NULL,
    "systemSource" TEXT NOT NULL,
    "reportOwner" TEXT NOT NULL,
    "parameters" TEXT,
    "logicSummary" TEXT,
    "completenessTested" BOOLEAN NOT NULL DEFAULT false,
    "accuracyTested" BOOLEAN NOT NULL DEFAULT false,
    "evidenceDoc" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Walkthrough" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "controlId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "participants" TEXT,
    "transactionRef" TEXT,
    "systemsInspected" TEXT,
    "observations" TEXT,
    "processChanged" BOOLEAN NOT NULL DEFAULT false,
    "conclusion" TEXT NOT NULL DEFAULT 'Not Assessed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ToDTest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "riskId" TEXT,
    "testerName" TEXT NOT NULL,
    "reviewerName" TEXT,
    "period" TEXT NOT NULL,
    "testObjective" TEXT NOT NULL,
    "objectiveAlignment" BOOLEAN NOT NULL DEFAULT false,
    "riskCoverage" BOOLEAN NOT NULL DEFAULT false,
    "precisionAdequate" BOOLEAN NOT NULL DEFAULT false,
    "segregationDuties" BOOLEAN NOT NULL DEFAULT false,
    "evidenceSufficiency" BOOLEAN NOT NULL DEFAULT false,
    "observations" TEXT,
    "conclusion" TEXT NOT NULL DEFAULT 'Not Assessed',
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "testedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ToDTest_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ControlMaster" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ToDTest_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BusinessProcess" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ToDTest_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "RiskMaster" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ToETest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "riskId" TEXT,
    "testerName" TEXT NOT NULL,
    "reviewerName" TEXT,
    "period" TEXT NOT NULL,
    "populationSize" INTEGER NOT NULL DEFAULT 0,
    "populationSource" TEXT NOT NULL DEFAULT 'Not Provided',
    "samplingMethod" TEXT NOT NULL DEFAULT 'Not Selected',
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "passCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "testerConclusion" TEXT NOT NULL DEFAULT 'Not Assessed',
    "finalConclusion" TEXT NOT NULL DEFAULT 'Not Assessed',
    "status" TEXT NOT NULL DEFAULT 'Planned',
    "notes" TEXT,
    "testedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ToETest_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ControlMaster" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ToETest_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BusinessProcess" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ToETest_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "RiskMaster" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TestSample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "toeTestId" TEXT NOT NULL,
    "sampleNumber" INTEGER NOT NULL,
    "transactionRef" TEXT NOT NULL,
    "transactionDate" DATETIME NOT NULL,
    "amount" REAL,
    "attributesTested" TEXT,
    "result" TEXT NOT NULL DEFAULT 'Not Tested',
    "failureReason" TEXT,
    "evidenceRef" TEXT,
    CONSTRAINT "TestSample_toeTestId_fkey" FOREIGN KEY ("toeTestId") REFERENCES "ToETest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TestingException" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "toeTestId" TEXT NOT NULL,
    "exceptionNumber" TEXT NOT NULL,
    "sampleRef" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'High',
    "status" TEXT NOT NULL DEFAULT 'Confirmed Exception',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TestingException_toeTestId_fkey" FOREIGN KEY ("toeTestId") REFERENCES "ToETest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ControlDeficiency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exceptionId" TEXT,
    "deficiencyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'Control Deficiency',
    "financialImpact" REAL,
    "regulatoryImpact" TEXT,
    "compensatingControls" TEXT,
    "humanApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ControlDeficiency_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "TestingException" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RootCauseAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deficiencyId" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT '5 Why',
    "why1" TEXT,
    "why2" TEXT,
    "why3" TEXT,
    "why4" TEXT,
    "why5" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Process',
    "rootCauseStatement" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RootCauseAnalysis_deficiencyId_fkey" FOREIGN KEY ("deficiencyId") REFERENCES "ControlDeficiency" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Issue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'TOE',
    "processId" TEXT NOT NULL,
    "riskId" TEXT,
    "controlId" TEXT,
    "deficiencyId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'High',
    "ownerName" TEXT NOT NULL,
    "targetDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Issue_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Issue_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BusinessProcess" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Issue_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "RiskMaster" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Issue_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ControlMaster" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Issue_deficiencyId_fkey" FOREIGN KEY ("deficiencyId") REFERENCES "ControlDeficiency" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ManagementActionPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mapId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "agreedAction" TEXT NOT NULL,
    "recommendation" TEXT,
    "actionOwner" TEXT NOT NULL,
    "approverName" TEXT NOT NULL,
    "originalDueDate" DATETIME NOT NULL,
    "revisedDueDate" DATETIME,
    "extensionCount" INTEGER NOT NULL DEFAULT 0,
    "extensionReason" TEXT,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ManagementActionPlan_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MAPMilestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mapId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "evidenceDoc" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MAPMilestone_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "ManagementActionPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RetestRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mapId" TEXT NOT NULL,
    "retestId" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "passedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "testerName" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'Not Assessed',
    "conclusionNotes" TEXT,
    "retestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RetestRecord_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "ManagementActionPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MonitoringRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL,
    "queryLogic" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'Real Time',
    "threshold" TEXT NOT NULL DEFAULT '0 Transactions',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "lastRunDate" DATETIME,
    "lastStatus" TEXT NOT NULL DEFAULT 'Not Run',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonitoringRule_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ControlMaster" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MonitoringRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "runTimestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "populationChecked" INTEGER NOT NULL DEFAULT 0,
    "exceptionsFound" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Healthy',
    "details" TEXT,
    CONSTRAINT "MonitoringRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "MonitoringRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CCMException" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "transactionRef" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CCMException_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MonitoringRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ControlCertification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "controlId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "declarationText" TEXT NOT NULL,
    "certifierName" TEXT NOT NULL,
    "certifierRole" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "certifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ControlCertification_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ControlMaster" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ManagementAttestation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "scopeSummary" TEXT NOT NULL,
    "cfoSignOff" BOOLEAN NOT NULL DEFAULT false,
    "cfoName" TEXT,
    "croSignOff" BOOLEAN NOT NULL DEFAULT false,
    "croName" TEXT,
    "overallOpinion" TEXT,
    "attestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RiskAcceptance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "riskId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "compensatingControls" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "expiryDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskAcceptance_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "RiskMaster" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'High',
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "entityRef" TEXT,
    "link" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT,
    "userName" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "ipAddress" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Institution_legalName_key" ON "Institution"("legalName");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Framework_code_key" ON "Framework"("code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProcessCategory_code_key" ON "ProcessCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SIPOC_processId_key" ON "SIPOC"("processId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ControlRiskMapping_controlId_riskId_key" ON "ControlRiskMapping"("controlId", "riskId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RootCauseAnalysis_deficiencyId_key" ON "RootCauseAnalysis"("deficiencyId");
