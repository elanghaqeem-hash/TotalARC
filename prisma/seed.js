const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Reference taxonomy only. This script must never create institutions,
// users, transactions, test results, findings, remediation records, or
// monitoring results.
const industries = [
  ['Technology','IT Services','Digital Transformation & Managed Services'],
  ['Technology','Software','SaaS & Cloud Platforms'],
  ['Technology','Cybersecurity','Information Security Services'],
  ['Financial Services','Commercial Banking','Corporate & Retail Banking'],
  ['Financial Services','Insurance','Life & General Insurance'],
  ['Financial Services','Fintech','Payment Gateway & E-Wallet'],
  ['Energy','Power Generation','Renewable Energy'],
  ['Energy','Oil & Gas','Upstream, Midstream & Downstream'],
  ['Mining','Mineral Processing','Mining & Smelting'],
  ['Manufacturing','Industrial Manufacturing','Discrete & Process Manufacturing'],
  ['Telecommunications','Telecom Operator','Mobile, Fixed & Fiber'],
  ['Transportation & Logistics','Supply Chain','Freight, Port & Warehousing'],
  ['Healthcare','Healthcare Provider','Hospital & Diagnostics'],
  ['Retail & Consumer','Retail','Omnichannel & E-Commerce'],
  ['Property & Construction','Construction & Property','Infrastructure & Real Estate'],
  ['Government & Public Sector','Government Agency','Public Administration'],
  ['Professional Services','Consulting','Audit, Advisory & Professional Services']
];

const frameworks = [
  ['COSO-IC','COSO Internal Control - Integrated Framework','Internal Control','Applicable'],
  ['COSO-ERM','COSO Enterprise Risk Management','Risk Management','Applicable'],
  ['ISO-31000','ISO 31000:2018 Risk Management Guidelines','Risk Management','Applicable'],
  ['ISO-27001','ISO/IEC 27001:2022 Information Security','Cybersecurity','Applicable'],
  ['SOX-404','Sarbanes-Oxley Section 404 (ICOFR)','Financial Reporting','Reference'],
  ['COBIT-2019','COBIT 2019 Framework for IT Governance','IT Governance','Reference'],
  ['NIST-CSF','NIST Cybersecurity Framework 2.0','Cybersecurity','Reference']
];

const processCategories = [
  ['CAT-GOV','Governance & Strategy',1],
  ['CAT-CORE','Core Business Operations',2],
  ['CAT-FIN','Finance & Treasury',3],
  ['CAT-IT','Information Technology & Cyber',4],
  ['CAT-PROC','Procurement & Vendor Management',5],
  ['CAT-HR','Human Resources & People',6]
];

async function main() {
  for (const [industry, sector, subsector] of industries) {
    const exists = await prisma.industryClassification.findFirst({ where: { industry, sector, subsector } });
    if (!exists) await prisma.industryClassification.create({ data: { industry, sector, subsector } });
  }

  for (const [code, name, category, applicability] of frameworks) {
    const exists = await prisma.framework.findFirst({ where: { code } });
    if (!exists) await prisma.framework.create({ data: { code, name, category, applicability } });
  }

  for (const [code, name, orderIndex] of processCategories) {
    const exists = await prisma.processCategory.findFirst({ where: { code } });
    if (!exists) await prisma.processCategory.create({ data: { code, name, orderIndex } });
  }

  console.log('Reference taxonomy ready. No operational/demo records were created.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
