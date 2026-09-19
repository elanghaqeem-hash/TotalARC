import { createPrismaClient } from './prisma-client.mjs';

const prisma = createPrismaClient();
const LEGAL_NAME = 'PT. Bank Pembangunan Daerah Kalimantan Barat';

async function main() {
  const rows = await prisma.institution.findMany({
    where: {
      OR: [
        { legalName: LEGAL_NAME },
        { shortName: 'Bank Kalbar' }
      ]
    }
  });

  if (rows.length !== 1) {
    throw new Error(`Expected exactly one Bank Kalbar institution, found ${rows.length}`);
  }

  const institution = rows[0];
  if (
    institution.name !== 'Bank Kalbar' ||
    institution.legalName !== LEGAL_NAME ||
    institution.shortName !== 'Bank Kalbar' ||
    institution.institutionType !== 'Regional-Owned Enterprise' ||
    institution.country !== 'Indonesia'
  ) {
    throw new Error('Bank Kalbar institution master does not match the approved production identity');
  }

  const auditCount = await prisma.auditLog.count({
    where: {
      institutionId: institution.id,
      entityType: 'Institution',
      recordId: institution.id
    }
  });

  if (auditCount < 1) {
    throw new Error('Bank Kalbar bootstrap has no institution audit event');
  }

  console.log(JSON.stringify({
    ok: true,
    unique: true,
    auditCount,
    institution: {
      id: institution.id,
      name: institution.name,
      legalName: institution.legalName,
      shortName: institution.shortName,
      institutionType: institution.institutionType,
      country: institution.country
    }
  }, null, 2));
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
