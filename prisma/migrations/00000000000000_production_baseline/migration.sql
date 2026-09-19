-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
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
    "industryClassificationId" TEXT,
    "employeeCount" TEXT,
    "revenueRange" TEXT,
    "businessModel" TEXT,
    "operatingModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndustryClassification" (
    "id" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "subsector" TEXT NOT NULL,
    "code" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndustryClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalEntity" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Indonesia',
    "taxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationUnit" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "legalEntityId" TEXT,
    "parentId" TEXT,
    "type" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headName" TEXT,
    "headEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "department" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "passwordHash" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordChangedAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Framework" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "applicability" TEXT NOT NULL DEFAULT 'Applicable',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Framework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Regulation" (
    "id" TEXT NOT NULL,
    "regulator" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT 'Indonesia',
    "requirement" TEXT,
    "frequency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Regulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemApplication" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cloudOnPrem" TEXT NOT NULL DEFAULT 'Cloud',
    "criticality" TEXT NOT NULL,
    "systemOwner" TEXT,
    "vendor" TEXT,
    "dataClass" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessProcess" (
    "id" TEXT NOT NULL,
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
    "status" TEXT NOT NULL DEFAULT 'Approved',
    "version" TEXT NOT NULL DEFAULT '1.0',
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewDate" TIMESTAMP(3),
    "tags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessActivity" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessObjective" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "strategicGoal" TEXT,
    "expectedOutcome" TEXT,
    "kpi" TEXT,
    "kri" TEXT,
    "sla" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SIPOC" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "suppliers" TEXT,
    "inputs" TEXT,
    "processSteps" TEXT,
    "outputs" TEXT,
    "customers" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SIPOC_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskMaster" (
    "id" TEXT NOT NULL,
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
    "inherentLikelihood" INTEGER NOT NULL DEFAULT 3,
    "inherentImpact" INTEGER NOT NULL DEFAULT 4,
    "inherentScore" INTEGER NOT NULL DEFAULT 12,
    "inherentRating" TEXT NOT NULL DEFAULT 'High',
    "residualLikelihood" INTEGER NOT NULL DEFAULT 2,
    "residualImpact" INTEGER NOT NULL DEFAULT 3,
    "residualScore" INTEGER NOT NULL DEFAULT 6,
    "residualRating" TEXT NOT NULL DEFAULT 'Medium',
    "riskTreatment" TEXT NOT NULL DEFAULT 'Reduce',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "version" TEXT NOT NULL DEFAULT '1.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlMaster" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlRiskMapping" (
    "id" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlRiskMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentCampaign" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'RCSA',
    "period" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "ownerName" TEXT NOT NULL,
    "approverName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CSAResponse" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "wasPerformed" BOOLEAN NOT NULL DEFAULT false,
    "frequencyMet" BOOLEAN NOT NULL DEFAULT false,
    "evidenceAttached" BOOLEAN NOT NULL DEFAULT false,
    "exceptionsFound" BOOLEAN NOT NULL DEFAULT false,
    "exceptionCount" INTEGER NOT NULL DEFAULT 0,
    "processChanged" BOOLEAN NOT NULL DEFAULT false,
    "controlChanged" BOOLEAN NOT NULL DEFAULT false,
    "csaConclusion" TEXT NOT NULL DEFAULT 'Not Assessed',
    "assessorNotes" TEXT,
    "assessorName" TEXT NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CSAResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "financialStatement" TEXT NOT NULL,
    "balanceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isSignificant" BOOLEAN NOT NULL DEFAULT false,
    "scopingRationale" TEXT,
    "fraudExposure" TEXT NOT NULL DEFAULT 'Low',
    "complexity" TEXT NOT NULL DEFAULT 'Medium',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountAssertionMapping" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "assertion" TEXT NOT NULL,
    "isInScope" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountAssertionMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IPERegister" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "reportName" TEXT NOT NULL,
    "systemSource" TEXT NOT NULL,
    "reportOwner" TEXT NOT NULL,
    "parameters" TEXT,
    "logicSummary" TEXT,
    "completenessTested" BOOLEAN NOT NULL DEFAULT false,
    "accuracyTested" BOOLEAN NOT NULL DEFAULT false,
    "evidenceDoc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IPERegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Walkthrough" (
    "id" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "participants" TEXT,
    "transactionRef" TEXT,
    "systemsInspected" TEXT,
    "observations" TEXT,
    "processChanged" BOOLEAN NOT NULL DEFAULT false,
    "conclusion" TEXT NOT NULL DEFAULT 'Pending Review',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Walkthrough_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToDTest" (
    "id" TEXT NOT NULL,
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
    "testedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToDTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToETest" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "riskId" TEXT,
    "testerName" TEXT NOT NULL,
    "reviewerName" TEXT,
    "period" TEXT NOT NULL,
    "populationSize" INTEGER NOT NULL DEFAULT 0,
    "populationSource" TEXT NOT NULL,
    "samplingMethod" TEXT NOT NULL DEFAULT 'Not Defined',
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "passCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "testerConclusion" TEXT NOT NULL DEFAULT 'Not Assessed',
    "finalConclusion" TEXT NOT NULL DEFAULT 'Not Assessed',
    "status" TEXT NOT NULL DEFAULT 'Planned',
    "notes" TEXT,
    "testedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToETest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestSample" (
    "id" TEXT NOT NULL,
    "toeTestId" TEXT NOT NULL,
    "sampleNumber" INTEGER NOT NULL,
    "transactionRef" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION,
    "attributesTested" TEXT,
    "result" TEXT NOT NULL DEFAULT 'Not Tested',
    "failureReason" TEXT,
    "evidenceRef" TEXT,

    CONSTRAINT "TestSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestingException" (
    "id" TEXT NOT NULL,
    "toeTestId" TEXT NOT NULL,
    "exceptionNumber" TEXT NOT NULL,
    "sampleRef" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'High',
    "status" TEXT NOT NULL DEFAULT 'Confirmed Exception',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestingException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlDeficiency" (
    "id" TEXT NOT NULL,
    "exceptionId" TEXT,
    "deficiencyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'Control Deficiency',
    "financialImpact" DOUBLE PRECISION,
    "regulatoryImpact" TEXT,
    "compensatingControls" TEXT,
    "humanApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlDeficiency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RootCauseAnalysis" (
    "id" TEXT NOT NULL,
    "deficiencyId" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT '5 Why',
    "why1" TEXT,
    "why2" TEXT,
    "why3" TEXT,
    "why4" TEXT,
    "why5" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Process',
    "rootCauseStatement" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RootCauseAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
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
    "targetDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagementActionPlan" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "agreedAction" TEXT NOT NULL,
    "recommendation" TEXT,
    "actionOwner" TEXT NOT NULL,
    "approverName" TEXT NOT NULL,
    "originalDueDate" TIMESTAMP(3) NOT NULL,
    "revisedDueDate" TIMESTAMP(3),
    "extensionCount" INTEGER NOT NULL DEFAULT 0,
    "extensionReason" TEXT,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagementActionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MAPMilestone" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "evidenceDoc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MAPMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetestRecord" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "retestId" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "passedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "testerName" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'Not Assessed',
    "conclusionNotes" TEXT,
    "retestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetestRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringRule" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL,
    "queryLogic" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'Real Time',
    "threshold" TEXT NOT NULL DEFAULT '0 Transactions',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "lastRunDate" TIMESTAMP(3),
    "lastStatus" TEXT NOT NULL DEFAULT 'Not Run',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoringRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringRun" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "runTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "populationChecked" INTEGER NOT NULL DEFAULT 0,
    "exceptionsFound" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Not Run',
    "details" TEXT,

    CONSTRAINT "MonitoringRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CCMException" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "transactionRef" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CCMException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlCertification" (
    "id" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "declarationText" TEXT NOT NULL,
    "certifierName" TEXT NOT NULL,
    "certifierRole" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "certifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagementAttestation" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "scopeSummary" TEXT NOT NULL,
    "cfoSignOff" BOOLEAN NOT NULL DEFAULT false,
    "cfoName" TEXT,
    "croSignOff" BOOLEAN NOT NULL DEFAULT false,
    "croName" TEXT,
    "overallOpinion" TEXT,
    "attestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagementAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAcceptance" (
    "id" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "compensatingControls" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'High',
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "entityRef" TEXT,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AISuggestion" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "recommendation" TEXT,
    "suggestedRisk" TEXT,
    "suggestedControl" TEXT,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending Review',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AISuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "correlationId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Institution_industryClassificationId_idx" ON "Institution"("industryClassificationId");

-- CreateIndex
CREATE UNIQUE INDEX "IndustryClassification_industry_sector_subsector_key" ON "IndustryClassification"("industry", "sector", "subsector");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Framework_code_key" ON "Framework"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Regulation_regulator_code_key" ON "Regulation"("regulator", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessCategory_code_key" ON "ProcessCategory"("code");

-- CreateIndex
CREATE INDEX "BusinessProcess_institutionId_status_idx" ON "BusinessProcess"("institutionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessProcess_institutionId_processId_key" ON "BusinessProcess"("institutionId", "processId");

-- CreateIndex
CREATE UNIQUE INDEX "SIPOC_processId_key" ON "SIPOC"("processId");

-- CreateIndex
CREATE INDEX "RiskMaster_institutionId_status_idx" ON "RiskMaster"("institutionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RiskMaster_institutionId_riskId_key" ON "RiskMaster"("institutionId", "riskId");

-- CreateIndex
CREATE INDEX "ControlMaster_institutionId_status_idx" ON "ControlMaster"("institutionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ControlMaster_institutionId_controlId_key" ON "ControlMaster"("institutionId", "controlId");

-- CreateIndex
CREATE UNIQUE INDEX "ControlRiskMapping_controlId_riskId_key" ON "ControlRiskMapping"("controlId", "riskId");

-- CreateIndex
CREATE UNIQUE INDEX "CSAResponse_campaignId_controlId_key" ON "CSAResponse"("campaignId", "controlId");

-- CreateIndex
CREATE INDEX "FinancialAccount_institutionId_idx" ON "FinancialAccount"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_institutionId_accountCode_key" ON "FinancialAccount"("institutionId", "accountCode");

-- CreateIndex
CREATE INDEX "IPERegister_institutionId_idx" ON "IPERegister"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "RootCauseAnalysis_deficiencyId_key" ON "RootCauseAnalysis"("deficiencyId");

-- CreateIndex
CREATE UNIQUE INDEX "ControlCertification_controlId_period_key" ON "ControlCertification"("controlId", "period");

-- CreateIndex
CREATE INDEX "ManagementAttestation_institutionId_idx" ON "ManagementAttestation"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagementAttestation_institutionId_period_key" ON "ManagementAttestation"("institutionId", "period");

-- CreateIndex
CREATE INDEX "Task_institutionId_status_idx" ON "Task"("institutionId", "status");

-- CreateIndex
CREATE INDEX "Task_userId_status_idx" ON "Task"("userId", "status");

-- CreateIndex
CREATE INDEX "AISuggestion_institutionId_status_idx" ON "AISuggestion"("institutionId", "status");

-- CreateIndex
CREATE INDEX "AISuggestion_processId_idx" ON "AISuggestion"("processId");

-- AddForeignKey
ALTER TABLE "Institution" ADD CONSTRAINT "Institution_industryClassificationId_fkey" FOREIGN KEY ("industryClassificationId") REFERENCES "IndustryClassification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalEntity" ADD CONSTRAINT "LegalEntity_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationUnit" ADD CONSTRAINT "OrganizationUnit_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationUnit" ADD CONSTRAINT "OrganizationUnit_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationUnit" ADD CONSTRAINT "OrganizationUnit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "OrganizationUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessProcess" ADD CONSTRAINT "BusinessProcess_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessProcess" ADD CONSTRAINT "BusinessProcess_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessProcess" ADD CONSTRAINT "BusinessProcess_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrganizationUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessProcess" ADD CONSTRAINT "BusinessProcess_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProcessCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessProcess" ADD CONSTRAINT "BusinessProcess_parentProcessId_fkey" FOREIGN KEY ("parentProcessId") REFERENCES "BusinessProcess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessActivity" ADD CONSTRAINT "ProcessActivity_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BusinessProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessObjective" ADD CONSTRAINT "ProcessObjective_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BusinessProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SIPOC" ADD CONSTRAINT "SIPOC_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BusinessProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskMaster" ADD CONSTRAINT "RiskMaster_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskMaster" ADD CONSTRAINT "RiskMaster_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BusinessProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskMaster" ADD CONSTRAINT "RiskMaster_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ProcessActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlMaster" ADD CONSTRAINT "ControlMaster_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlMaster" ADD CONSTRAINT "ControlMaster_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BusinessProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlMaster" ADD CONSTRAINT "ControlMaster_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ProcessActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlRiskMapping" ADD CONSTRAINT "ControlRiskMapping_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ControlMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlRiskMapping" ADD CONSTRAINT "ControlRiskMapping_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "RiskMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentCampaign" ADD CONSTRAINT "AssessmentCampaign_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CSAResponse" ADD CONSTRAINT "CSAResponse_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AssessmentCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CSAResponse" ADD CONSTRAINT "CSAResponse_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ControlMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAssertionMapping" ADD CONSTRAINT "AccountAssertionMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IPERegister" ADD CONSTRAINT "IPERegister_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToDTest" ADD CONSTRAINT "ToDTest_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ControlMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToDTest" ADD CONSTRAINT "ToDTest_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BusinessProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToDTest" ADD CONSTRAINT "ToDTest_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "RiskMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToETest" ADD CONSTRAINT "ToETest_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ControlMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToETest" ADD CONSTRAINT "ToETest_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BusinessProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToETest" ADD CONSTRAINT "ToETest_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "RiskMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestSample" ADD CONSTRAINT "TestSample_toeTestId_fkey" FOREIGN KEY ("toeTestId") REFERENCES "ToETest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestingException" ADD CONSTRAINT "TestingException_toeTestId_fkey" FOREIGN KEY ("toeTestId") REFERENCES "ToETest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlDeficiency" ADD CONSTRAINT "ControlDeficiency_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "TestingException"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RootCauseAnalysis" ADD CONSTRAINT "RootCauseAnalysis_deficiencyId_fkey" FOREIGN KEY ("deficiencyId") REFERENCES "ControlDeficiency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BusinessProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "RiskMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ControlMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_deficiencyId_fkey" FOREIGN KEY ("deficiencyId") REFERENCES "ControlDeficiency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementActionPlan" ADD CONSTRAINT "ManagementActionPlan_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MAPMilestone" ADD CONSTRAINT "MAPMilestone_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "ManagementActionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetestRecord" ADD CONSTRAINT "RetestRecord_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "ManagementActionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringRule" ADD CONSTRAINT "MonitoringRule_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ControlMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringRun" ADD CONSTRAINT "MonitoringRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "MonitoringRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CCMException" ADD CONSTRAINT "CCMException_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MonitoringRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlCertification" ADD CONSTRAINT "ControlCertification_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ControlMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementAttestation" ADD CONSTRAINT "ManagementAttestation_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAcceptance" ADD CONSTRAINT "RiskAcceptance_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "RiskMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AISuggestion" ADD CONSTRAINT "AISuggestion_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AISuggestion" ADD CONSTRAINT "AISuggestion_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BusinessProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

