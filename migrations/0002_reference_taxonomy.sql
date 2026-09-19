-- Reference taxonomy only.
-- No institution, user, transaction, test result, issue, remediation, or monitoring
-- record may be created by this migration.

INSERT OR IGNORE INTO "IndustryClassification"
  ("id","industry","sector","subsector","code","createdAt")
VALUES
  ('ref-ind-tech-it-services','Technology','IT Services','Digital Transformation & Managed Services',NULL,CURRENT_TIMESTAMP),
  ('ref-ind-tech-software','Technology','Software','SaaS & Cloud Platforms',NULL,CURRENT_TIMESTAMP),
  ('ref-ind-tech-cyber','Technology','Cybersecurity','Information Security Services',NULL,CURRENT_TIMESTAMP),
  ('ref-ind-fs-banking','Financial Services','Commercial Banking','Corporate & Retail Banking',NULL,CURRENT_TIMESTAMP),
  ('ref-ind-fs-insurance','Financial Services','Insurance','Life & General Insurance',NULL,CURRENT_TIMESTAMP),
  ('ref-ind-fs-fintech','Financial Services','Fintech','Payment Gateway & E-Wallet',NULL,CURRENT_TIMESTAMP),
  ('ref-ind-energy-power','Energy','Power Generation','Renewable Energy',NULL,CURRENT_TIMESTAMP),
  ('ref-ind-energy-oilgas','Energy','Oil & Gas','Upstream, Midstream & Downstream',NULL,CURRENT_TIMESTAMP),
  ('ref-ind-mining-processing','Mining','Mineral Processing','Mining & Smelting',NULL,CURRENT_TIMESTAMP),
  ('ref-ind-manufacturing','Manufacturing','Industrial Manufacturing','Discrete & Process Manufacturing',NULL,CURRENT_TIMESTAMP),
  ('ref-ind-telecom','Telecommunications','Telecom Operator','Mobile, Fixed & Fiber',NULL,CURRENT_TIMESTAMP),
  ('ref-ind-logistics','Transportation & Logistics','Supply Chain','Freight, Port & Warehousing',NULL,CURRENT_TIMESTAMP),
  ('ref-ind-healthcare','Healthcare','Healthcare Provider','Hospital & Diagnostics',NULL,CURRENT_TIMESTAMP),
  ('ref-ind-retail','Retail & Consumer','Retail','Omnichannel & E-Commerce',NULL,CURRENT_TIMESTAMP),
  ('ref-ind-property','Property & Construction','Construction & Property','Infrastructure & Real Estate',NULL,CURRENT_TIMESTAMP),
  ('ref-ind-government','Government & Public Sector','Government Agency','Public Administration',NULL,CURRENT_TIMESTAMP),
  ('ref-ind-professional','Professional Services','Consulting','Audit, Advisory & Professional Services',NULL,CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "Framework"
  ("id","code","name","category","description","applicability","createdAt")
VALUES
  ('ref-fw-coso-ic','COSO-IC','COSO Internal Control - Integrated Framework','Internal Control',NULL,'Applicable',CURRENT_TIMESTAMP),
  ('ref-fw-coso-erm','COSO-ERM','COSO Enterprise Risk Management','Risk Management',NULL,'Applicable',CURRENT_TIMESTAMP),
  ('ref-fw-iso-31000','ISO-31000','ISO 31000:2018 Risk Management Guidelines','Risk Management',NULL,'Applicable',CURRENT_TIMESTAMP),
  ('ref-fw-iso-27001','ISO-27001','ISO/IEC 27001:2022 Information Security','Cybersecurity',NULL,'Applicable',CURRENT_TIMESTAMP),
  ('ref-fw-sox-404','SOX-404','Sarbanes-Oxley Section 404 (ICOFR)','Financial Reporting',NULL,'Reference',CURRENT_TIMESTAMP),
  ('ref-fw-cobit-2019','COBIT-2019','COBIT 2019 Framework for IT Governance','IT Governance',NULL,'Reference',CURRENT_TIMESTAMP),
  ('ref-fw-nist-csf','NIST-CSF','NIST Cybersecurity Framework 2.0','Cybersecurity',NULL,'Reference',CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "ProcessCategory"
  ("id","code","name","description","orderIndex","createdAt")
VALUES
  ('ref-cat-gov','CAT-GOV','Governance & Strategy',NULL,1,CURRENT_TIMESTAMP),
  ('ref-cat-core','CAT-CORE','Core Business Operations',NULL,2,CURRENT_TIMESTAMP),
  ('ref-cat-fin','CAT-FIN','Finance & Treasury',NULL,3,CURRENT_TIMESTAMP),
  ('ref-cat-it','CAT-IT','Information Technology & Cyber',NULL,4,CURRENT_TIMESTAMP),
  ('ref-cat-proc','CAT-PROC','Procurement & Vendor Management',NULL,5,CURRENT_TIMESTAMP),
  ('ref-cat-hr','CAT-HR','Human Resources & People',NULL,6,CURRENT_TIMESTAMP);
