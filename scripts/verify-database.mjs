import { createPrismaClient } from './prisma-client.mjs';

const prisma = createPrismaClient();

async function main() {
  await prisma.$queryRaw`SELECT 1`;

  const [
    industries,
    frameworks,
    processCategories,
    institutions,
    processes,
    risks,
    controls,
    tests,
    issues,
    monitoringRuns
  ] = await Promise.all([
    prisma.industryClassification.count(),
    prisma.framework.count(),
    prisma.processCategory.count(),
    prisma.institution.count(),
    prisma.businessProcess.count(),
    prisma.riskMaster.count(),
    prisma.controlMaster.count(),
    prisma.toETest.count(),
    prisma.issue.count(),
    prisma.monitoringRun.count()
  ]);

  if (industries === 0 || frameworks === 0 || processCategories === 0) {
    throw new Error('Reference seed is incomplete');
  }

  const transactional = { institutions, processes, risks, controls, tests, issues, monitoringRuns };
  const nonZero = Object.entries(transactional).filter(([, count]) => count !== 0);
  if (nonZero.length) {
    throw new Error('Reference seed created transactional/demo data: ' + JSON.stringify(Object.fromEntries(nonZero)));
  }

  console.log(JSON.stringify({
    database: 'reachable',
    referenceData: { industries, frameworks, processCategories },
    transactionalDataAfterReferenceSeed: transactional,
    verified: true
  }, null, 2));
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
