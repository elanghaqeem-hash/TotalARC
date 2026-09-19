import { createPrismaClient } from './prisma-client.mjs';

const prisma = createPrismaClient();

const BANK_KALBAR = {
  name: 'Bank Kalbar',
  legalName: 'PT. Bank Pembangunan Daerah Kalimantan Barat',
  shortName: 'Bank Kalbar',
  institutionType: 'Regional-Owned Enterprise',
  country: 'Indonesia'
};

async function main() {
  const existing = await prisma.institution.findFirst({
    where: {
      OR: [
        { legalName: BANK_KALBAR.legalName },
        { shortName: BANK_KALBAR.shortName }
      ]
    }
  });

  const institution = existing
    ? await prisma.institution.update({
        where: { id: existing.id },
        data: BANK_KALBAR
      })
    : await prisma.institution.create({
        data: BANK_KALBAR
      });

  await prisma.auditLog.create({
    data: {
      institutionId: institution.id,
      userName: 'System Bootstrap',
      userRole: 'System',
      action: existing ? 'UPDATE' : 'CREATE',
      entityType: 'Institution',
      recordId: institution.id,
      reason: existing
        ? 'Bank Kalbar institution master synchronized into hardened PostgreSQL source of truth.'
        : 'Bank Kalbar institution master bootstrapped into hardened PostgreSQL source of truth.',
      newValue: JSON.stringify({
        name: institution.name,
        legalName: institution.legalName,
        shortName: institution.shortName,
        institutionType: institution.institutionType,
        country: institution.country
      })
    }
  });

  console.log(JSON.stringify({
    ok: true,
    action: existing ? 'updated' : 'created',
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
