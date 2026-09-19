-- Enforce stable business keys required by multi-tenant production workflows.

CREATE UNIQUE INDEX "Institution_legalName_key" ON "Institution"("legalName");
CREATE UNIQUE INDEX "Institution_shortName_key" ON "Institution"("shortName");

CREATE UNIQUE INDEX "LegalEntity_institutionId_code_key"
ON "LegalEntity"("institutionId", "code");

CREATE UNIQUE INDEX "OrganizationUnit_institutionId_code_key"
ON "OrganizationUnit"("institutionId", "code");

CREATE UNIQUE INDEX "IPERegister_institutionId_reportName_key"
ON "IPERegister"("institutionId", "reportName");

CREATE UNIQUE INDEX "ToDTest_controlId_testId_key"
ON "ToDTest"("controlId", "testId");

CREATE UNIQUE INDEX "ToETest_controlId_testId_key"
ON "ToETest"("controlId", "testId");

CREATE UNIQUE INDEX "ManagementActionPlan_issueId_mapId_key"
ON "ManagementActionPlan"("issueId", "mapId");

CREATE UNIQUE INDEX "MonitoringRule_controlId_ruleId_key"
ON "MonitoringRule"("controlId", "ruleId");
