import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const industries = [
  ['Financial Services','Banking','Commercial & Retail Banking'],
  ['Financial Services','Banking','Islamic Banking'],
  ['Financial Services','Capital Markets','Securities & Brokerage'],
  ['Financial Services','Insurance','Life Insurance'],
  ['Financial Services','Insurance','General Insurance'],
  ['Financial Services','Fintech','Payments & Digital Finance'],
  ['Technology','IT Services','Software & Managed Services'],
  ['Technology','Telecommunications','Telecommunications'],
  ['Energy & Resources','Oil & Gas','Upstream Oil & Gas'],
  ['Energy & Resources','Oil & Gas','Midstream & Downstream'],
  ['Energy & Resources','Mining','Minerals & Mining'],
  ['Energy & Resources','Utilities','Electricity & Utilities'],
  ['Industrial','Manufacturing','General Manufacturing'],
  ['Industrial','Automotive','Automotive & Components'],
  ['Consumer','Retail','Retail & E-Commerce'],
  ['Consumer','Food & Beverage','Food & Beverage'],
  ['Healthcare','Healthcare Providers','Hospitals & Clinical Services'],
  ['Healthcare','Pharmaceuticals','Pharmaceuticals'],
  ['Transportation & Logistics','Logistics','Logistics & Warehousing'],
  ['Transportation & Logistics','Maritime','Ports & Maritime'],
  ['Infrastructure','Construction','Engineering & Construction'],
  ['Real Estate','Property','Property & Real Estate'],
  ['Public Sector','Government','Government & Public Administration'],
  ['Education','Education Services','Schools & Higher Education'],
  ['Professional Services','Advisory','Consulting & Professional Services']
];

const processCategories = [
  ['GOV','Governance & Strategy','Enterprise governance, strategy and oversight',10],
  ['CORE','Core Operations','Primary value-delivery and operational processes',20],
  ['FIN','Finance & Accounting','Finance, accounting, treasury and financial reporting',30],
  ['RISK','Risk, Compliance & Assurance','Risk management, compliance, control and assurance',40],
  ['HR','People & Human Resources','Workforce and human-capital processes',50],
  ['IT','Technology & Cybersecurity','Technology, data and cybersecurity processes',60],
  ['PROC','Procurement & Third Party','Sourcing, procurement and third-party processes',70],
  ['LEGAL','Legal & Corporate Affairs','Legal, corporate secretariat and related processes',80],
  ['SALES','Commercial & Customer','Sales, marketing, product and customer processes',90],
  ['SUPPORT','Corporate Support','Facilities, administration and other support processes',100]
];

const frameworks = [
  ['COSO-IC','COSO Internal Control — Integrated Framework','Internal Control'],
  ['COSO-ERM','COSO Enterprise Risk Management','Enterprise Risk'],
  ['ISO-31000','ISO 31000 Risk Management','Risk Management'],
  ['ISO-27001','ISO/IEC 27001 Information Security Management','Cybersecurity'],
  ['ISO-22301','ISO 22301 Business Continuity Management','Resilience'],
  ['COBIT-2019','COBIT 2019','IT Governance'],
  ['NIST-CSF-2','NIST Cybersecurity Framework 2.0','Cybersecurity'],
  ['SOX-404','Sarbanes-Oxley Section 404','Financial Reporting']
];

async function main() {
  for (const [industry, sector, subsector] of industries) {
    await prisma.industryClassification.upsert({
      where: { industry_sector_subsector: { industry, sector, subsector } },
      update: {},
      create: { industry, sector, subsector }
    });
  }

  for (const [code, name, description, orderIndex] of processCategories) {
    await prisma.processCategory.upsert({
      where: { code },
      update: { name, description, orderIndex },
      create: { code, name, description, orderIndex }
    });
  }

  for (const [code, name, category] of frameworks) {
    await prisma.framework.upsert({
      where: { code },
      update: { name, category },
      create: { code, name, category, applicability: 'Reference' }
    });
  }

  console.log('Reference data seeded. No demo institutions, users, tests, issues or transactions were created.');
}

main().finally(() => prisma.$disconnect());
